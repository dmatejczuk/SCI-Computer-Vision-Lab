import type { CV, Mat } from './cv';
import type { MatScope } from './scope';

let canvas: OffscreenCanvas | null = null;
let context: OffscreenCanvasRenderingContext2D | null = null;

/** Reads an ImageBitmap into an RGBA ImageData. The bitmap is closed afterwards. */
export function bitmapToImageData(bitmap: ImageBitmap): ImageData {
  const { width, height } = bitmap;
  if (!canvas || canvas.width !== width || canvas.height !== height) {
    canvas = new OffscreenCanvas(width, height);
    context = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!context) throw new Error('2D canvas unavailable in worker');
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, width, height);
}

/** Converts a 1- or 4-channel 8-bit Mat into an RGBA ImageData scaled to `width` pixels. */
export function matToImageData(cv: CV, scope: MatScope, mat: Mat, width?: number): ImageData {
  let source = mat;
  if (width && width < mat.cols) {
    const height = Math.max(1, Math.round((mat.rows * width) / mat.cols));
    const small = scope.mat();
    cv.resize(mat, small, new cv.Size(width, height), 0, 0, cv.INTER_AREA);
    source = small;
  }
  let rgba = source;
  if (source.channels() === 1) {
    rgba = scope.mat();
    cv.cvtColor(source, rgba, cv.COLOR_GRAY2RGBA);
  } else if (source.channels() === 3) {
    rgba = scope.mat();
    cv.cvtColor(source, rgba, cv.COLOR_RGB2RGBA);
  }
  return new ImageData(new Uint8ClampedArray(rgba.data), rgba.cols, rgba.rows);
}

/** A neutral test image used when no camera frame is available. */
export function testPattern(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const block = ((x >> 5) + (y >> 5)) % 2 ? 40 : 0;
      data[i] = (x / width) * 200 + block;
      data[i + 1] = (y / height) * 200 + block;
      data[i + 2] = 120 + block;
      data[i + 3] = 255;
    }
  return new ImageData(data, width, height);
}
