/// <reference lib="webworker" />
import type { Point } from '../graph/types';
import { loadOpenCv, type CV, type Mat } from './cv';
import { runBenchmark } from './benchmark';
import { executeGraph, ResultCache } from './engine';
import { bitmapToImageData, matToImageData, testPattern } from './imageIO';
import type { Value } from './operations';
import { MatScope } from './scope';
import {
  resultBitmaps,
  type FromWorker,
  type NodeResult,
  type ProcessResult,
  type ToWorker,
} from './protocol';

declare const self: DedicatedWorkerGlobalScope;
let cv: CV | null = null;
/** The frozen frame lives only in this worker's memory and is dropped on unfreeze/reset. */
let frozen: ImageData | null = null;
let frozenId = 0;
const cache = new ResultCache();

function post(message: FromWorker, transfer: Transferable[] = []) {
  self.postMessage(message, transfer);
}

function describe(error: unknown) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  // A CSP without 'wasm-unsafe-eval' rejects WebAssembly compilation with a CompileError.
  const csp = /CompileError|Content Security Policy|wasm-unsafe-eval|unsafe-eval/i.test(message);
  return { message, csp };
}

function openCvBytes(): number | null {
  // The largest script named like OpenCV is the library itself (not its small wrapper).
  const sizes = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
    .filter((item) => /opencv/i.test(item.name))
    .map((item) => item.decodedBodySize || item.encodedBodySize);
  return sizes.length ? Math.max(...sizes) || null : null;
}

/** An RGBA copy of a 1- or 4-channel image. */
function toRgba(cv: CV, scope: MatScope, mat: Mat): Mat {
  const out = scope.mat();
  if (mat.channels() === 1) cv.cvtColor(mat, out, cv.COLOR_GRAY2RGBA);
  else mat.copyTo(out);
  return out;
}

/** RGBA copy of a binary image with the plate outline drawn in green. */
function regionDisplay(cv: CV, scope: MatScope, base: Mat, quad: Point[] | null): Mat {
  const out = toRgba(cv, scope, base);
  if (quad) {
    const thickness = Math.max(2, Math.round(base.cols / 160));
    const color = new cv.Scalar(60, 220, 90, 255);
    quad.forEach((point, index) => {
      const next = quad[(index + 1) % quad.length];
      cv.line(
        out,
        new cv.Point(Math.round(point.x), Math.round(point.y)),
        new cv.Point(Math.round(next.x), Math.round(next.y)),
        color,
        thickness,
      );
    });
  }
  return out;
}

/** Two images side by side at the same height (Compare block). */
function sideBySide(cv: CV, scope: MatScope, left: Mat, right: Mat): Mat {
  const height = Math.min(left.rows, right.rows);
  const parts = [left, right].map((mat) => {
    const rgba = toRgba(cv, scope, mat);
    if (rgba.rows === height) return rgba;
    const resized = scope.mat();
    const width = Math.round((rgba.cols * height) / rgba.rows);
    cv.resize(rgba, resized, new cv.Size(width, height), 0, 0, cv.INTER_AREA);
    return resized;
  });
  const vector = scope.track(new cv.MatVector());
  parts.forEach((part) => vector.push_back(part));
  const out = scope.mat();
  cv.hconcat(vector, out);
  return out;
}

const imageOf = (value: Value | undefined) =>
  value && value.type !== 'region' ? value.mat : undefined;

async function process(
  cv: CV,
  message: Extract<ToWorker, { type: 'process' }>,
): Promise<ProcessResult> {
  const started = performance.now();
  const { options, graph, source } = message;
  const image = source.kind === 'camera' ? bitmapToImageData(source.bitmap) : frozen;
  if (!image) throw new Error('No frozen frame');
  const live = source.kind === 'camera';
  if (live) cache.clear();
  const scope = new MatScope(cv);
  try {
    const original = scope.track(cv.matFromImageData(image));
    let input = original;
    const width = Math.min(options.workWidth, original.cols);
    if (width !== original.cols) {
      input = scope.mat();
      const height = Math.round((original.rows * width) / original.cols);
      cv.resize(original, input, new cv.Size(width, height), 0, 0, cv.INTER_AREA);
    }
    const run = executeGraph(cv, scope, graph, input, {
      cache: live ? undefined : cache,
      frame: `frozen-${frozenId}-${input.cols}`,
    });
    // The picture each node shows: its output, or what it received (views).
    const displays = new Map<string, Mat>();
    let region: Point[] | undefined;
    for (const node of graph.nodes) {
      const value = run.values.get(node.id);
      const inputs = run.inputs.get(node.id) ?? {};
      if (value?.type === 'region') {
        displays.set(node.id, regionDisplay(cv, scope, value.base, value.quad));
        if (!region && value.quad) region = value.quad;
      } else if (value) displays.set(node.id, value.mat);
      else if (node.type === 'compare') {
        const left = imageOf(inputs.left);
        const right = imageOf(inputs.right);
        if (left && right) displays.set(node.id, sideBySide(cv, scope, left, right));
      } else if (node.type === 'preview' || node.type === 'output') {
        const mat = imageOf(inputs.in);
        if (mat && run.runs.has(node.id)) displays.set(node.id, mat);
      }
    }
    const nodes: Record<string, NodeResult> = {};
    const pending: Promise<void>[] = [];
    const bitmap = (mat: Mat, width: number | undefined, store: (b: ImageBitmap) => void) =>
      pending.push(createImageBitmap(matToImageData(cv, scope, mat, width)).then(store));
    for (const node of graph.nodes) {
      const runInfo = run.runs.get(node.id);
      const entry: NodeResult = runInfo ? { ...runInfo } : { ms: 0 };
      nodes[node.id] = entry;
      const display = displays.get(node.id);
      if (display && options.thumbWidth > 0)
        bitmap(display, options.thumbWidth, (b) => (entry.thumbnail = b));
    }
    const result: ProcessResult = {
      totalMs: 0,
      size: { width: input.cols, height: input.rows },
      nodes,
      region,
      liveMats: 0,
      cachedMats: 0,
    };
    const preview = options.preview ? displays.get(options.preview) : undefined;
    if (preview) bitmap(preview, undefined, (b) => (result.preview = b));
    if (options.full) {
      bitmap(input, undefined, (b) => (result.source = b));
      const outputNode = graph.nodes.find((node) => node.type === 'output');
      const output = outputNode && displays.get(outputNode.id);
      if (output) bitmap(output, undefined, (b) => (result.output = b));
    }
    await Promise.all(pending);
    result.totalMs = performance.now() - started;
    return result;
  } finally {
    scope.release();
  }
}

async function handle(message: ToWorker) {
  if (message.type === 'init') {
    const started = performance.now();
    cv = await loadOpenCv();
    const version = /Version control:\s*(\S+)/.exec(cv.getBuildInformation())?.[1] ?? '?';
    post({
      type: 'ready',
      id: message.id,
      loadMs: performance.now() - started,
      openCvBytes: openCvBytes(),
      version,
    });
    return;
  }
  if (!cv) cv = await loadOpenCv();
  if (message.type === 'benchmark') {
    const begin = performance.now();
    const image = message.bitmap ? bitmapToImageData(message.bitmap) : testPattern(1280, 720);
    const readMs = performance.now() - begin;
    const result = await runBenchmark(cv, image, message.width, message.thumbnails);
    post({ type: 'benchmark', id: message.id, readMs, liveMats: MatScope.live, ...result });
  } else if (message.type === 'process') {
    const result = await process(cv, message);
    result.liveMats = MatScope.live;
    result.cachedMats = cache.size;
    post({ type: 'processed', id: message.id, result }, resultBitmaps(result));
  } else if (message.type === 'freeze') {
    frozen = bitmapToImageData(message.bitmap);
    frozenId++;
    cache.clear();
    post({ type: 'ok', id: message.id });
  } else if (message.type === 'unfreeze' || message.type === 'reset') {
    frozen = null;
    cache.clear();
    post({ type: 'ok', id: message.id });
  }
}

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  handle(message).catch((error) => {
    if ('bitmap' in message) message.bitmap?.close();
    if (message.type === 'process' && message.source.kind === 'camera')
      message.source.bitmap.close();
    post({ type: 'error', id: message.id, ...describe(error) });
  });
};
