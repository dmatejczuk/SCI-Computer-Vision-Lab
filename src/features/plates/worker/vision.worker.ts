/// <reference lib="webworker" />
import { loadOpenCv, type CV } from './cv';
import { runBenchmark } from './benchmark';
import { bitmapToImageData, matToImageData, testPattern } from './imageIO';
import { MatScope } from './scope';
import { resultBitmaps, type FromWorker, type ProcessResult, type ToWorker } from './protocol';

declare const self: DedicatedWorkerGlobalScope;
let cv: CV | null = null;
/** The frozen frame lives only in this worker's memory and is dropped on unfreeze/reset. */
let frozen: ImageData | null = null;

async function process(
  cv: CV,
  message: Extract<ToWorker, { type: 'process' }>,
): Promise<ProcessResult> {
  const started = performance.now();
  const image =
    message.source.kind === 'camera' ? bitmapToImageData(message.source.bitmap) : frozen;
  if (!image) throw new Error('No frozen frame');
  const scope = new MatScope(cv);
  try {
    const input = scope.track(cv.matFromImageData(image));
    let work = input;
    const width = Math.min(message.options.workWidth, input.cols);
    if (width !== input.cols) {
      work = scope.mat();
      const height = Math.round((input.rows * width) / input.cols);
      cv.resize(input, work, new cv.Size(width, height), 0, 0, cv.INTER_AREA);
    }
    const source = await createImageBitmap(matToImageData(cv, scope, work));
    return {
      totalMs: performance.now() - started,
      size: { width: work.cols, height: work.rows },
      source,
      liveMats: 0,
    };
  } finally {
    scope.release();
  }
}

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
    post({ type: 'processed', id: message.id, result }, resultBitmaps(result));
  } else if (message.type === 'freeze') {
    frozen = bitmapToImageData(message.bitmap);
    post({ type: 'ok', id: message.id });
  } else if (message.type === 'unfreeze' || message.type === 'reset') {
    frozen = null;
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
