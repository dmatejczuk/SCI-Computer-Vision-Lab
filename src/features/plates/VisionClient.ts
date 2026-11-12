import type { FromWorker, ToWorker } from './worker/protocol';

type Request = ToWorker extends infer T
  ? T extends { id: number }
    ? Omit<T, 'id'>
    : never
  : never;
type Pending = { resolve: (message: FromWorker) => void; reject: (error: WorkerError) => void };

export class WorkerError extends Error {
  constructor(
    message: string,
    readonly csp = false,
  ) {
    super(message);
  }
}

/** Owns the OpenCV.js worker and matches each response to its request. */
export class VisionClient {
  private worker: Worker | null = null;
  private next = 1;
  private pending = new Map<number, Pending>();
  private ready: Promise<Extract<FromWorker, { type: 'ready' }>> | null = null;

  private ensure() {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./worker/vision.worker.ts', import.meta.url), {
      type: 'module',
      name: 'plates-vision',
    });
    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      const message = event.data;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.type === 'error') pending.reject(new WorkerError(message.message, message.csp));
      else pending.resolve(message);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      this.failAll(new WorkerError(event.message || 'Worker failure'));
    };
    this.worker = worker;
    return worker;
  }

  private failAll(error: WorkerError) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  request<T extends FromWorker['type']>(
    message: Request,
    transfer: Transferable[] = [],
  ): Promise<Extract<FromWorker, { type: T }>> {
    const worker = this.ensure();
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (message: FromWorker) => void, reject });
      worker.postMessage({ ...message, id }, transfer);
    });
  }

  init() {
    this.ready ??= this.request<'ready'>({ type: 'init' }).catch((error) => {
      this.ready = null;
      throw error;
    });
    return this.ready;
  }

  /** Stops the worker and frees all of its WebAssembly memory. */
  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    this.failAll(new WorkerError('Worker terminated'));
  }
}

/** How the camera image is turned before processing (a phone may send a portrait or sideways image). */
export interface FrameOrientation {
  /** Clockwise rotation in degrees. */
  rotate: 0 | 90 | 180 | 270;
  /** Left-right flip of the final image. */
  mirror: boolean;
}
export const UPRIGHT: FrameOrientation = { rotate: 0, mirror: false };
/** Plates are wide: a taller image is cropped around its centre to this width / height. */
export const LANDSCAPE_RATIO = 4 / 3;

export interface FrameGeometry {
  /** Size of the rotated source image. */
  rotated: { width: number; height: number };
  /** Rows of the rotated image that are kept (centre crop to landscape). */
  crop: { top: number; height: number };
  scale: number;
  /** Size of the produced frame. */
  width: number;
  height: number;
}

/** Rotation, landscape crop and scaling of a `sourceWidth`×`sourceHeight` camera frame. */
export function frameGeometry(
  sourceWidth: number,
  sourceHeight: number,
  orientation: FrameOrientation,
  maxWidth: number,
): FrameGeometry {
  const sideways = orientation.rotate % 180 !== 0;
  const rotated = sideways
    ? { width: sourceHeight, height: sourceWidth }
    : { width: sourceWidth, height: sourceHeight };
  const height = Math.min(rotated.height, Math.round(rotated.width / LANDSCAPE_RATIO));
  const crop = { top: Math.floor((rotated.height - height) / 2), height };
  const scale = Math.min(1, maxWidth / rotated.width);
  return {
    rotated,
    crop,
    scale,
    width: Math.max(1, Math.round(rotated.width * scale)),
    height: Math.max(1, Math.round(crop.height * scale)),
  };
}

let scratch: HTMLCanvasElement | null = null;

/**
 * Grabs the current video frame turned upright (rotation, flip), cropped to landscape and
 * scaled to at most `width`. The frame is drawn into `canvas` when given (the visible camera
 * preview), so the preview shows exactly what the operations receive. Never mirrored by default.
 */
export function grabFrame(
  video: HTMLVideoElement,
  width: number,
  orientation: FrameOrientation = UPRIGHT,
  canvas?: HTMLCanvasElement | null,
) {
  if (!video.videoWidth || video.readyState < 2) return Promise.resolve(null);
  const geometry = frameGeometry(video.videoWidth, video.videoHeight, orientation, width);
  const target = canvas ?? (scratch ??= document.createElement('canvas'));
  if (target.width !== geometry.width) target.width = geometry.width;
  if (target.height !== geometry.height) target.height = geometry.height;
  const context = target.getContext('2d');
  if (!context) return Promise.resolve(null);
  const { rotated, crop, scale } = geometry;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.imageSmoothingQuality = 'medium';
  context.scale(scale, scale);
  context.translate(rotated.width / 2, rotated.height / 2 - crop.top);
  if (orientation.mirror) context.scale(-1, 1);
  context.rotate((orientation.rotate * Math.PI) / 180);
  context.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2);
  return createImageBitmap(target);
}
