import type { SessionManager } from '../../services/SessionManager';
import { VisionClient, WorkerError, grabFrame } from './VisionClient';
import { connect, createNode } from './graph/graph';
import type { BlockType, Graph } from './graph/types';
import { levelById, type LevelId } from './levels';
import { plateConfig } from './plateConfig';
import { cleanPlate } from './recognition/compare';
import type { PlateSceneOptions } from './recognition/plateImage';
import { Voter, type VotedCharacter } from './recognition/recognize';
import {
  resultBitmaps,
  type FrameSource,
  type ProcessOptions,
  type ProcessResult,
} from './worker/protocol';

/** At most 15 processing passes per second (plan, section 5.3). */
export const MAX_HZ = 15;
export const FULL_WIDTH = 640;
export const REDUCED_WIDTH = 320;
/** A pass slower than this switches the working image to 320 px. */
export const SLOW_PASS_MS = 60;

/** Width of node thumbnails in the editor. */
export const THUMB_WIDTH = 160;

/** A straight chain camera → blocks → output, laid out left to right. */
export function chainGraph(types: BlockType[]): Graph {
  const nodes = (['camera', ...types, 'output'] as BlockType[]).map((type, index) =>
    createNode(type, { x: index * 230, y: 80 }),
  );
  let graph: Graph = { nodes, edges: [] };
  for (let i = 1; i < nodes.length; i++)
    graph = connect(graph, { source: nodes[i - 1].id, target: nodes[i].id, targetHandle: 'in' });
  return graph;
}

export interface PlateState {
  level: LevelId;
  /** How many hints of the current level are visible. */
  hintsShown: number;
  /** Levels 2–3: use the generated practice image instead of the camera. */
  practice: boolean;
  /** Levels whose plate was read completely and correctly. */
  completed: LevelId[];
  /** Facilitator option: offer every block in the palette, not only the level's subset. */
  allBlocks: boolean;
  cachedMats: number;
  wasmBytes: number;
  /** Node editor or the plate reader screen. */
  view: 'editor' | 'reader';
  /** The plate the student assembled, typed on the reader screen. */
  myPlate: string;
  graph: Graph;
  canUndo: boolean;
  canRedo: boolean;
  /** Node shown in the large preview window. */
  preview: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: 'csp' | 'failed' | null;
  frozen: boolean;
  /** A generated plate photo used instead of the camera (level 1). */
  sample: { text: string; scene: PlateSceneOptions } | null;
  /** Characters read from the Output block, stabilised over recent frames. */
  reading: VotedCharacter[];
  /** How many characters a correct result should have. */
  expected: number;
  workWidth: number;
  fps: number;
  passMs: number;
  liveMats: number;
}

const initial = (): PlateState => ({
  level: 1,
  hintsShown: 0,
  practice: false,
  completed: [],
  allBlocks: false,
  cachedMats: 0,
  wasmBytes: 0,
  view: 'editor',
  myPlate: '',
  graph: levelById(1).start(),
  canUndo: false,
  canRedo: false,
  preview: null,
  status: 'idle',
  error: null,
  frozen: false,
  sample: levelById(1).sample,
  reading: [],
  expected: levelById(1).sample!.text.length,
  workWidth: FULL_WIDTH,
  fps: 0,
  passMs: 0,
  liveMats: 0,
});

/** Chooses the working width from recent pass durations, with hysteresis. */
export function adaptWidth(current: number, recentMs: number[]): number {
  if (recentMs.length < 5) return current;
  const average = recentMs.reduce((a, b) => a + b, 0) / recentMs.length;
  if (current === FULL_WIDTH && average > SLOW_PASS_MS) return REDUCED_WIDTH;
  if (current === REDUCED_WIDTH && average < SLOW_PASS_MS / 4) return FULL_WIDTH;
  return current;
}

/**
 * State of the plate reader module for one station. Owns the worker and the frame loop:
 * at most one frame in flight, so no queue can build up; while frozen (or when nothing
 * changed) no new pass is started. Everything lives in RAM and `reset()` clears it.
 */
export class PlateSession {
  private state = initial();
  private listeners = new Set<() => void>();
  private resultListeners = new Set<(result: ProcessResult) => void>();
  private vision = new VisionClient();
  private video: HTMLVideoElement | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private inFlight = false;
  private dirty = true;
  private generation = 0;
  private recent: number[] = [];
  private lastPass = 0;
  private past: Graph[] = [];
  private future: Graph[] = [];
  private lastChange: { key: string; time: number } | null = null;
  latest: ProcessResult | null = null;
  /** The graph "Wyczyść" goes back to (the level's starting graph). */
  protected startGraph: Graph = this.state.graph;

  constructor(private session: SessionManager) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  /** Results carry ImageBitmaps; they are valid until the next result arrives. */
  onResult(listener: (result: ProcessResult) => void) {
    this.resultListeners.add(listener);
    return () => {
      this.resultListeners.delete(listener);
    };
  }

  protected patch(values: Partial<PlateState>) {
    this.state = { ...this.state, ...values };
    this.listeners.forEach((listener) => listener());
  }

  /** Whether the current pass needs live camera frames. */
  protected get live() {
    return !this.state.frozen && !this.state.sample;
  }
  private voter = new Voter(7);

  async attach(video: HTMLVideoElement) {
    this.video = video;
    this.running = true;
    this.session.setPlatesLive(this.live);
    if (this.state.status !== 'ready') {
      this.patch({ status: 'loading', error: null });
      const generation = this.generation;
      try {
        await this.vision.init();
        if (generation !== this.generation) return;
        this.patch({ status: 'ready' });
      } catch (error) {
        if (generation !== this.generation) return;
        console.error('[plates]', error);
        this.patch({
          status: 'error',
          error: error instanceof WorkerError && error.csp ? 'csp' : 'failed',
        });
        return;
      }
    }
    this.invalidate();
  }

  detach() {
    this.running = false;
    this.video = null;
    clearTimeout(this.timer);
    this.session.setPlatesLive(false);
  }

  /** Something the result depends on changed: process again as soon as allowed. */
  invalidate() {
    this.dirty = true;
    this.schedule();
  }

  private schedule() {
    clearTimeout(this.timer);
    if (!this.running || this.inFlight || this.state.status !== 'ready') return;
    if (!this.live && !this.dirty) return;
    const wait = Math.max(0, 1000 / MAX_HZ - (performance.now() - this.lastPass));
    this.timer = setTimeout(() => void this.tick(), wait);
  }

  protected buildRequest(): { graph: Graph; options: ProcessOptions } {
    return {
      graph: this.state.graph,
      options: {
        workWidth: this.state.workWidth,
        thumbWidth: THUMB_WIDTH,
        preview: this.state.preview,
        // The reader screen needs full-size input and output images.
        full: this.state.view === 'reader',
      },
    };
  }

  private setGraph(graph: Graph) {
    this.voter.clear();
    this.patch({ graph, canUndo: this.past.length > 0, canRedo: this.future.length > 0 });
    this.invalidate();
  }

  /** Uses a generated plate photo (or the camera again with null). */
  private setSample(sample: PlateState['sample']) {
    this.voter.clear();
    this.patch({ sample, reading: [] });
    this.patch({ expected: this.expectedCount() });
    this.session.setPlatesLive(this.running && this.live);
    this.invalidate();
  }

  /** Characters a full reading should have: the built-in plate, the typed plate or the slots. */
  private expectedCount() {
    const typed = cleanPlate(this.state.myPlate);
    return this.state.sample?.text.length ?? (typed.length || plateConfig.slots);
  }

  private levelGraphs = new Map<LevelId, Graph>();

  /** Switches level; each level keeps its own graph while the group works. */
  setLevel(id: LevelId) {
    if (id === this.state.level) return;
    this.levelGraphs.set(this.state.level, this.state.graph);
    const level = levelById(id);
    const start = level.start();
    this.startGraph = start;
    this.past = [];
    this.future = [];
    this.lastChange = null;
    this.patch({
      level: id,
      hintsShown: 0,
      practice: false,
      view: 'editor',
      preview: null,
      frozen: false,
      graph: this.levelGraphs.get(id) ?? start,
      canUndo: false,
      canRedo: false,
    });
    this.setSample(level.sample);
  }

  /** Levels 2–3: practise on a generated image or use the camera. */
  setPractice(practice: boolean) {
    const level = levelById(this.state.level);
    if (!level.practice) return;
    this.patch({ practice, frozen: false });
    this.setSample(practice ? level.practice : null);
  }

  setAllBlocks(allBlocks: boolean) {
    this.patch({ allBlocks });
  }

  showHint() {
    const total = levelById(this.state.level).hints.length;
    this.patch({ hintsShown: Math.min(total, this.state.hintsShown + 1) });
  }

  /** Facilitator: replaces the graph with the level's reference solution (can be undone). */
  loadReference() {
    this.apply(levelById(this.state.level).reference());
  }

  /**
   * Applies an edit and records it for undo. Edits with the same `key` that follow each
   * other quickly (dragging a slider) form one undo step.
   */
  apply(graph: Graph, key?: string) {
    const current = this.state.graph;
    if (graph === current) return;
    const now = performance.now();
    const merge = key && this.lastChange?.key === key && now - this.lastChange.time < 1500;
    if (!merge) {
      this.past = [...this.past.slice(-99), current];
    }
    this.lastChange = key ? { key, time: now } : null;
    this.future = [];
    this.setGraph(graph);
  }

  undo() {
    const previous = this.past.at(-1);
    if (!previous) return;
    this.past = this.past.slice(0, -1);
    this.future = [...this.future, this.state.graph];
    this.lastChange = null;
    this.setGraph(previous);
  }

  redo() {
    const next = this.future.at(-1);
    if (!next) return;
    this.future = this.future.slice(0, -1);
    this.past = [...this.past, this.state.graph];
    this.lastChange = null;
    this.setGraph(next);
  }

  /** "Wyczyść": back to the starting graph (can be undone). */
  clearGraph() {
    this.apply(this.startGraph);
  }

  /** Opens (or closes with null) the large preview of one block. */
  setPreview(node: string | null) {
    this.patch({ preview: node });
    this.invalidate();
  }

  private async tick() {
    if (!this.running || this.inFlight) return;
    const generation = this.generation;
    let source: FrameSource | null = null;
    if (this.state.sample) source = { kind: 'sample', ...this.state.sample };
    else if (this.state.frozen) source = { kind: 'frozen' };
    else if (this.video && this.session.frames.fresh) {
      const bitmap = await grabFrame(this.video, FULL_WIDTH).catch(() => null);
      if (bitmap) source = { kind: 'camera', bitmap };
    }
    if (!source || generation !== this.generation || !this.running) {
      if (source?.kind === 'camera') source.bitmap.close();
      this.lastPass = performance.now();
      this.schedule();
      return;
    }
    this.inFlight = true;
    this.dirty = false;
    const started = performance.now();
    // The 15 Hz cadence counts from the start of each pass, not from its end.
    const interval = started - this.lastPass;
    this.lastPass = started;
    try {
      const { result } = await this.vision.request<'processed'>(
        { type: 'process', source, ...this.buildRequest() },
        source.kind === 'camera' ? [source.bitmap] : [],
      );
      if (generation !== this.generation) {
        resultBitmaps(result).forEach((bitmap) => bitmap.close());
        return;
      }
      this.publish(result, performance.now() - started, interval);
    } catch (error) {
      if (generation === this.generation) console.error('[plates] pass failed', error);
    } finally {
      this.inFlight = false;
      if (generation === this.generation) this.schedule();
    }
  }

  private publish(result: ProcessResult, elapsed: number, interval: number) {
    const previous = this.latest;
    this.latest = result;
    this.resultListeners.forEach((listener) => listener(result));
    if (previous) resultBitmaps(previous).forEach((bitmap) => bitmap.close());
    if (this.live) {
      this.recent = [...this.recent.slice(-9), result.totalMs];
    }
    const fps = this.live && interval < 5000 ? 1000 / Math.max(1, interval) : 0;
    const workWidth = adaptWidth(this.state.workWidth, this.recent);
    if (workWidth !== this.state.workWidth) this.recent = [];
    this.patch({
      passMs: elapsed,
      fps: this.state.fps ? this.state.fps * 0.8 + fps * 0.2 : fps,
      liveMats: result.liveMats,
      cachedMats: result.cachedMats,
      wasmBytes: result.wasmBytes,
      workWidth,
    });
    this.afterResult(result);
  }

  private afterResult(result: ProcessResult) {
    // A still image gives the same reading every time: one vote is enough.
    if (!this.live) this.voter.clear();
    this.voter.push(result.reading?.characters ?? []);
    const reading = this.voter.result();
    const key = (list: VotedCharacter[]) =>
      list.map((c) => `${c.char}${c.confidence}${c.alternatives.map((a) => a.char)}`).join();
    if (key(reading) !== key(this.state.reading)) this.patch({ reading });
    // The level counts as solved once the reader reads the whole plate correctly.
    const target = this.state.sample?.text ?? cleanPlate(this.state.myPlate);
    const text = reading.map((c) => c.char).join('');
    if (target && text === target && !this.state.completed.includes(this.state.level))
      this.patch({ completed: [...this.state.completed, this.state.level] });
  }

  setView(view: PlateState['view']) {
    if (view === this.state.view) return;
    this.patch({ view, preview: null });
    this.invalidate();
  }

  setMyPlate(myPlate: string) {
    this.patch({ myPlate: myPlate.toUpperCase().slice(0, 12) });
    this.patch({ expected: this.expectedCount() });
  }

  /** The reader makes sense once the Output block finds a plausible number of characters. */
  get canRead() {
    const found = this.state.reading.length;
    return found >= Math.max(1, this.state.expected - 2) && found <= this.state.expected + 1;
  }

  /** The text read from the current Output image. */
  get text() {
    return this.state.reading.map((c) => c.char).join('');
  }

  async freeze() {
    if (this.state.frozen || !this.video || this.state.status !== 'ready') return;
    const bitmap = await grabFrame(this.video, FULL_WIDTH);
    if (!bitmap) return;
    await this.vision.request<'ok'>({ type: 'freeze', bitmap }, [bitmap]);
    this.voter.clear();
    this.patch({ frozen: true });
    this.session.setPlatesLive(this.live);
    this.invalidate();
  }

  async unfreeze() {
    if (!this.state.frozen) return;
    this.patch({ frozen: false });
    this.session.setPlatesLive(this.live);
    if (this.state.status === 'ready') await this.vision.request<'ok'>({ type: 'unfreeze' });
    this.invalidate();
  }

  /** "Nowa grupa": forget everything, including the worker and its WebAssembly memory. */
  reset() {
    this.generation++;
    clearTimeout(this.timer);
    this.inFlight = false;
    this.vision.terminate();
    if (this.latest) resultBitmaps(this.latest).forEach((bitmap) => bitmap.close());
    this.latest = null;
    this.recent = [];
    this.past = [];
    this.future = [];
    this.voter.clear();
    this.levelGraphs.clear();
    this.lastChange = null;
    this.dirty = true;
    this.state = initial();
    this.startGraph = this.state.graph;
    this.listeners.forEach((listener) => listener());
  }
}

let instance: PlateSession | null = null;
/** The station's plate session if the plate module was opened (facilitator panel). */
export const existingPlateSession = () => instance;
/** One plate session per station tab, cleared by the session's "Nowa grupa". */
export function plateSessionFor(session: SessionManager): PlateSession {
  if (!instance) {
    const plates = new PlateSession(session);
    session.onReset(() => plates.reset());
    instance = plates;
  }
  return instance;
}
