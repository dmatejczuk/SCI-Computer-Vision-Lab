/** Typed messages between the plate module UI and its OpenCV.js worker. */
import type { Graph, Point } from '../graph/types';
import type { PlateSceneOptions } from '../recognition/plateImage';
import type { Recognized } from '../recognition/recognize';

export interface BenchmarkTiming {
  name: string;
  ms: number;
}

/** Where the worker takes the image of one processing pass from. */
export type FrameSource =
  /** A live camera frame, transferred without copying. */
  | { kind: 'camera'; bitmap: ImageBitmap }
  /** The frame stored by the last `freeze` message. */
  | { kind: 'frozen' }
  /** A plate photo generated from the tile font (built-in level images). */
  | { kind: 'sample'; text: string; scene: PlateSceneOptions };

export interface ProcessOptions {
  /** Width of the image the operations run on (640, or 320 on slow computers). */
  workWidth: number;
  /** Width of node thumbnails; 0 skips them. */
  thumbWidth: number;
  /** Node shown in the large preview, sent at working size. */
  preview: string | null;
  /** Also send the full-size input and output images (reader screen). */
  full: boolean;
}

export interface NodeResult {
  ms: number;
  error?: string;
  info?: string;
  cached?: boolean;
  thumbnail?: ImageBitmap;
}

export interface ProcessResult {
  totalMs: number;
  size: { width: number; height: number };
  nodes: Record<string, NodeResult>;
  /** Large view of `options.preview`. */
  preview?: ImageBitmap;
  /** The input image as the operations see it (unmirrored, working size), when `full`. */
  source?: ImageBitmap;
  /** The image that reached the Output block, when `full`. */
  output?: ImageBitmap;
  /** The plate found by the first "Find plate" block, in working-image coordinates. */
  region?: Point[];
  /** Characters read from the Output block's image (boxes in that image's pixels). */
  reading?: { characters: Recognized[]; size: { width: number; height: number } };
  liveMats: number;
  cachedMats: number;
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
  | { type: 'process'; id: number; source: FrameSource; graph: Graph; options: ProcessOptions }
  | { type: 'freeze'; id: number; bitmap: ImageBitmap }
  | { type: 'unfreeze'; id: number }
  /** Forgets the frozen frame and all cached data (new group). */
  | { type: 'reset'; id: number };

export type FromWorker =
  | {
      type: 'ready';
      id: number;
      loadMs: number;
      openCvBytes: number | null;
      version: string;
      templates: number;
    }
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
  const list: ImageBitmap[] = [];
  for (const node of Object.values(result.nodes)) if (node.thumbnail) list.push(node.thumbnail);
  for (const bitmap of [result.preview, result.source, result.output])
    if (bitmap) list.push(bitmap);
  return list;
}
