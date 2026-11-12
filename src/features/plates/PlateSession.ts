import type { SessionManager } from '../../services/SessionManager';
import { VisionClient, WorkerError, grabFrame } from './VisionClient';
import { connect, createNode } from './graph/graph';
import type { BlockType, Graph } from './graph/types';
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
  graph: Graph;
  canUndo: boolean;
  canRedo: boolean;
  /** Node shown in the large preview window. */
  preview: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: 'csp' | 'failed' | null;
  frozen: boolean;
  workWidth: number;
  fps: number;
  passMs: number;
  liveMats: number;
}

const initial = (): PlateState => ({
  graph: chainGraph([]),
  canUndo: false,
  canRedo: false,
  preview: null,
  status: 'idle',
  error: null,
  frozen: false,
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
    return !this.state.frozen;
  }

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

  /** The reader screen needs full-size input and output images. */
  protected fullImages = false;

  protected buildRequest(): { graph: Graph; options: ProcessOptions } {
    return {
      graph: this.state.graph,
      options: {
        workWidth: this.state.workWidth,
        thumbWidth: THUMB_WIDTH,
        preview: this.state.preview,
        full: this.fullImages,
      },
    };
  }

  private setGraph(graph: Graph) {
    this.patch({ graph, canUndo: this.past.length > 0, canRedo: this.future.length > 0 });
    this.invalidate();
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
    if (this.state.frozen) source = { kind: 'frozen' };
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
    try {
      const { result } = await this.vision.request<'processed'>(
        { type: 'process', source, ...this.buildRequest() },
        source.kind === 'camera' ? [source.bitmap] : [],
      );
      if (generation !== this.generation) {
        resultBitmaps(result).forEach((bitmap) => bitmap.close());
        return;
      }
      this.publish(result, performance.now() - started);
    } catch (error) {
      if (generation === this.generation) console.error('[plates] pass failed', error);
    } finally {
      this.inFlight = false;
      if (generation === this.generation) {
        this.lastPass = performance.now();
        this.schedule();
      }
    }
  }

  private publish(result: ProcessResult, elapsed: number) {
    const previous = this.latest;
    this.latest = result;
    this.resultListeners.forEach((listener) => listener(result));
    if (previous) resultBitmaps(previous).forEach((bitmap) => bitmap.close());
    if (this.live) {
      this.recent = [...this.recent.slice(-9), result.totalMs];
    }
    const now = performance.now();
    const fps = this.live && this.lastPass ? 1000 / Math.max(1, now - this.lastPass) : 0;
    const workWidth = adaptWidth(this.state.workWidth, this.recent);
    if (workWidth !== this.state.workWidth) this.recent = [];
    this.patch({
      passMs: elapsed,
      fps: this.state.fps ? this.state.fps * 0.8 + fps * 0.2 : fps,
      liveMats: result.liveMats,
      workWidth,
    });
    this.afterResult(result);
  }

  /** Hook for subclasses / later phases. */
  protected afterResult(result: ProcessResult) {
    void result;
  }

  async freeze() {
    if (this.state.frozen || !this.video || this.state.status !== 'ready') return;
    const bitmap = await grabFrame(this.video, FULL_WIDTH);
    if (!bitmap) return;
    await this.vision.request<'ok'>({ type: 'freeze', bitmap }, [bitmap]);
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
    this.lastChange = null;
    this.dirty = true;
    this.state = initial();
    this.startGraph = this.state.graph;
    this.listeners.forEach((listener) => listener());
  }
}

let instance: PlateSession | null = null;
/** One plate session per station tab, cleared by the session's "Nowa grupa". */
export function plateSessionFor(session: SessionManager): PlateSession {
  if (!instance) {
    const plates = new PlateSession(session);
    session.onReset(() => plates.reset());
    instance = plates;
  }
  return instance;
}
