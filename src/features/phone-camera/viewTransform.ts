/** Left-right (flipX) and upside-down (flipY) flips; both together equal a 180° turn. */
export type ViewTransform = { flipX: boolean; flipY: boolean };
const KEY = 'aivision.phone.flip';
export const identity: ViewTransform = { flipX: false, flipY: false };
export const isIdentity = (t: ViewTransform) => !t.flipX && !t.flipY;
/** CSS for the phone preview, so it shows exactly the image sent to the computer. */
export const previewTransform = (t: ViewTransform) =>
  isIdentity(t) ? undefined : `scale(${t.flipX ? -1 : 1}, ${t.flipY ? -1 : 1})`;
export function loadView(storage?: Pick<Storage, 'getItem'>): ViewTransform {
  try {
    const v = JSON.parse(storage?.getItem(KEY) ?? 'null') as Partial<ViewTransform> | null;
    if (v && typeof v.flipX === 'boolean' && typeof v.flipY === 'boolean')
      return { flipX: v.flipX, flipY: v.flipY };
  } catch {
    // Unreadable or blocked storage falls back to the plain camera view.
  }
  return identity;
}
export function saveView(t: ViewTransform, storage?: Pick<Storage, 'setItem'>) {
  try {
    storage?.setItem(KEY, JSON.stringify(t));
  } catch {
    // Private mode or blocked storage: the setting lasts for this page only.
  }
}
export const canTransform = () =>
  typeof HTMLCanvasElement !== 'undefined' &&
  typeof HTMLCanvasElement.prototype.captureStream === 'function';
type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};
/** Redraws camera frames flipped into a canvas whose track is sent instead of the camera. */
export class TransformedStream {
  readonly stream: MediaStream;
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private handle = 0;
  private stopped = false;
  constructor(
    private video: FrameVideo,
    readonly source: MediaStreamTrack,
    public transform: ViewTransform,
  ) {
    this.stream = this.canvas.captureStream(30);
    this.schedule();
  }
  private schedule() {
    if (this.stopped) return;
    const draw = () => this.draw();
    this.handle = this.video.requestVideoFrameCallback
      ? this.video.requestVideoFrameCallback(draw)
      : requestAnimationFrame(draw);
  }
  private draw() {
    if (this.stopped) return;
    if (this.source.readyState === 'ended') {
      this.stop();
      return;
    }
    const v = this.video;
    if (v.videoWidth && v.videoHeight) {
      const { videoWidth: w, videoHeight: h } = v;
      if (this.canvas.width !== w) this.canvas.width = w;
      if (this.canvas.height !== h) this.canvas.height = h;
      const { flipX, flipY } = this.transform;
      this.ctx.setTransform(flipX ? -1 : 1, 0, 0, flipY ? -1 : 1, flipX ? w : 0, flipY ? h : 0);
      this.ctx.drawImage(v, 0, 0, w, h);
    }
    this.schedule();
  }
  stop() {
    this.stopped = true;
    if (this.video.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this.handle);
    else cancelAnimationFrame(this.handle);
    this.stream.getTracks().forEach((t) => t.stop());
  }
}
type FsDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
const doc = () => document as FsDocument;
export const fullscreenSupported = () =>
  !!(document.fullscreenEnabled || doc().webkitFullscreenEnabled);
export const isFullscreen = () => !!(document.fullscreenElement ?? doc().webkitFullscreenElement);
/** Must be called synchronously from a user gesture; failures leave the page as it is. */
export async function enterFullscreen(el: FsElement = document.documentElement) {
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else await el.webkitRequestFullscreen?.();
  } catch {
    // Browsers may refuse fullscreen (e.g. iPhone Safari); the layout already fills the screen.
  }
}
export async function exitFullscreen() {
  try {
    if (!isFullscreen()) return;
    if (document.exitFullscreen) await document.exitFullscreen();
    else await doc().webkitExitFullscreen?.();
  } catch {
    // Already left fullscreen.
  }
}
