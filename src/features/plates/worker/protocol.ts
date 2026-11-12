/** Typed messages between the plate module UI and its OpenCV.js worker. */

export interface BenchmarkTiming {
  name: string;
  ms: number;
}

export type ToWorker =
  | { type: 'init'; id: number }
  | {
      type: 'benchmark';
      id: number;
      /** Camera frame, transferred without copying. Absent: a generated test image. */
      bitmap?: ImageBitmap;
      width: number;
      thumbnails: boolean;
    };

export type FromWorker =
  | { type: 'ready'; id: number; loadMs: number; openCvBytes: number | null; version: string }
  | {
      type: 'benchmark';
      id: number;
      size: { width: number; height: number };
      readMs: number;
      operations: BenchmarkTiming[];
      thumbnailsMs: number;
      totalMs: number;
      liveMats: number;
    }
  | { type: 'error'; id: number; message: string; csp: boolean };
