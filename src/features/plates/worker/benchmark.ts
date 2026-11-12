import type { CV } from './cv';
import { matToImageData } from './imageIO';
import { MatScope } from './scope';
import type { BenchmarkTiming } from './protocol';

/**
 * Phase-0 performance probe: eight typical plate-reader operations on one frame, timed one by
 * one, plus the cost of preparing node thumbnails. Every Mat is released before returning.
 */
export async function runBenchmark(cv: CV, image: ImageData, width: number, thumbnails: boolean) {
  const scope = new MatScope(cv);
  const operations: BenchmarkTiming[] = [];
  const started = performance.now();
  let thumbnailsMs = 0;
  try {
    const time = (name: string, work: () => void) => {
      const begin = performance.now();
      work();
      operations.push({ name, ms: performance.now() - begin });
    };
    const input = scope.track(cv.matFromImageData(image));
    let src = input;
    if (input.cols !== width) {
      src = scope.mat();
      const height = Math.round((input.rows * width) / input.cols);
      time('resize', () => cv.resize(input, src, new cv.Size(width, height), 0, 0, cv.INTER_AREA));
    }
    const gray = scope.mat();
    const blur = scope.mat();
    const equalized = scope.mat();
    const binary = scope.mat();
    const adaptive = scope.mat();
    const opened = scope.mat();
    const edges = scope.mat();
    const labels = scope.mat();
    const stats = scope.mat();
    const centroids = scope.mat();
    const contours = scope.track(new cv.MatVector());
    const hierarchy = scope.mat();
    const kernel = scope.track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));
    time('cvtColor', () => cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY));
    time('GaussianBlur', () => cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0));
    time('equalizeHist', () => cv.equalizeHist(blur, equalized));
    time('threshold (Otsu)', () =>
      cv.threshold(equalized, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU),
    );
    time('adaptiveThreshold', () =>
      cv.adaptiveThreshold(
        blur,
        adaptive,
        255,
        cv.ADAPTIVE_THRESH_MEAN_C,
        cv.THRESH_BINARY,
        25,
        10,
      ),
    );
    time('morphologyEx', () => cv.morphologyEx(binary, opened, cv.MORPH_OPEN, kernel));
    time('Canny', () => cv.Canny(blur, edges, 60, 120));
    time('findContours', () =>
      cv.findContours(opened, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE),
    );
    time('connectedComponentsWithStats', () =>
      cv.connectedComponentsWithStats(opened, labels, stats, centroids, 8, cv.CV_32S),
    );
    if (thumbnails) {
      const begin = performance.now();
      const images = [src, gray, blur, equalized, binary, adaptive, opened, edges].map((mat) =>
        matToImageData(cv, scope, mat, 160),
      );
      const bitmaps = await Promise.all(images.map((data) => createImageBitmap(data)));
      bitmaps.forEach((bitmap) => bitmap.close());
      thumbnailsMs = performance.now() - begin;
    }
    return {
      size: { width: src.cols, height: src.rows },
      operations,
      thumbnailsMs,
      totalMs: performance.now() - started,
    };
  } finally {
    scope.release();
  }
}
