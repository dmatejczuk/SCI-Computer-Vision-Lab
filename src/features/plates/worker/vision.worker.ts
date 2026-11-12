/// <reference lib="webworker" />
import { loadOpenCv, type CV } from './cv';
import { runBenchmark } from './benchmark';
import { bitmapToImageData, testPattern } from './imageIO';
import { MatScope } from './scope';
import type { FromWorker, ToWorker } from './protocol';

declare const self: DedicatedWorkerGlobalScope;
let cv: CV | null = null;

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
  }
}

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  handle(message).catch((error) => {
    if ('bitmap' in message) message.bitmap?.close();
    post({ type: 'error', id: message.id, ...describe(error) });
  });
};
