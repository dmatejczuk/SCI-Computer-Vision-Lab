import type * as OpenCv from '@techstark/opencv-js';

/** The OpenCV.js namespace as typed by @techstark/opencv-js. */
export type CV = typeof OpenCv;
export type Mat = OpenCv.Mat;

let loading: Promise<CV> | null = null;

/**
 * Loads the bundled OpenCV.js build once. The WebAssembly module is embedded in the
 * JavaScript file, so no extra request is made and nothing is fetched from the Internet.
 * Compiling it requires `'wasm-unsafe-eval'` in the page's Content-Security-Policy.
 */
export function loadOpenCv(): Promise<CV> {
  loading ??= (async () => {
    // An empty module: fails fast with a clear error when the CSP forbids WebAssembly.
    await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    const { opencv } = await import('./opencvModule');
    const cv = opencv.cv as CV & {
      onRuntimeInitialized?: () => void;
      then?: unknown;
    };
    if (typeof cv.Mat !== 'function')
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('OpenCV.js initialisation timeout')),
          60000,
        );
        cv.onRuntimeInitialized = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    // The Emscripten module is "thenable": returning it from an async function would make
    // the promise adopt it again and again. Removing `then` makes it a plain object.
    delete cv.then;
    return cv;
  })();
  return loading;
}
