import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { patchOpenCv } from '../../scripts/opencv-patch';
import type { CV } from '../../src/features/plates/worker/cv';

let loading: Promise<CV> | null = null;

/**
 * Loads the same CSP-patched OpenCV.js that the application bundles, so the unit tests
 * also exercise the patch.
 */
export function loadTestOpenCv(): Promise<CV> {
  loading ??= (async () => {
    const require = createRequire(import.meta.url);
    const file = require.resolve('@techstark/opencv-js');
    const patched = join(tmpdir(), `opencv-patched-${process.pid}.cjs`);
    writeFileSync(patched, patchOpenCv(readFileSync(file, 'utf8')));
    const cv = require(patched) as CV & { onRuntimeInitialized?: () => void; then?: unknown };
    if (typeof cv.Mat !== 'function')
      await new Promise<void>((resolve) => {
        cv.onRuntimeInitialized = () => resolve();
      });
    delete cv.then;
    return cv;
  })();
  return loading;
}

/** A plain RGBA image (ImageData does not exist in Node). */
export function rgbaImage(
  width: number,
  height: number,
  paint: (x: number, y: number) => number | [number, number, number],
) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const value = paint(x, y);
      const [r, g, b] = typeof value === 'number' ? [value, value, value] : value;
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  return { width, height, data, colorSpace: 'srgb' } as unknown as ImageData;
}
