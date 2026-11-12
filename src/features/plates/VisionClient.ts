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

/** Grabs the current video frame, scaled to `width`, without mirroring. */
export function grabFrame(video: HTMLVideoElement, width: number) {
  if (!video.videoWidth || video.readyState < 2) return Promise.resolve(null);
  const scale = Math.min(1, width / video.videoWidth);
  return createImageBitmap(video, {
    resizeWidth: Math.round(video.videoWidth * scale),
    resizeHeight: Math.round(video.videoHeight * scale),
    resizeQuality: 'medium',
  });
}
