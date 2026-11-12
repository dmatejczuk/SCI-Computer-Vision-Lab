/** Typed messages between the plate module UI and its OpenCV.js worker. */

export interface BenchmarkTiming {
  name: string;
  ms: number;
}

/** Where the worker takes the image of one processing pass from. */
export type FrameSource =
  /** A live camera frame, transferred without copying. */
  | { kind: 'camera'; bitmap: ImageBitmap }
  /** The frame stored by the last `freeze` message. */
  | { kind: 'frozen' };

export interface ProcessOptions {
  /** Width of the image the operations run on (640, or 320 on slow computers). */
  workWidth: number;
}

export interface ProcessResult {
  totalMs: number;
  size: { width: number; height: number };
  /** The input image as the operations see it (unmirrored, working size). */
  source: ImageBitmap;
  liveMats: number;
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
    }
  | { type: 'process'; id: number; source: FrameSource; options: ProcessOptions }
  | { type: 'freeze'; id: number; bitmap: ImageBitmap }
  | { type: 'unfreeze'; id: number }
  /** Forgets the frozen frame and all cached data (new group). */
  | { type: 'reset'; id: number };

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
  | { type: 'processed'; id: number; result: ProcessResult }
  | { type: 'ok'; id: number }
  | { type: 'error'; id: number; message: string; csp: boolean };

/** Every ImageBitmap inside a result, so they can be transferred and later closed. */
export function resultBitmaps(result: ProcessResult): ImageBitmap[] {
  return [result.source];
}
