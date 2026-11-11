import type { VideoSource } from './VideoSource';
export class CameraService implements VideoSource {
  readonly kind = 'local';
  stream: MediaStream | null = null;
  private generation = 0;
  private video?: HTMLVideoElement;
  private cancelReady?: () => void;
  private deviceListener = () => {
    if (this.stream && !this.stream.getVideoTracks().some((track) => track.readyState === 'live'))
      this.onLost();
  };
  constructor(private onLost: () => void) {}
  get label() {
    return this.stream?.getVideoTracks()[0]?.label ?? '';
  }
  async start(video: HTMLVideoElement, deviceId?: string) {
    this.stop();
    const generation = this.generation;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
      throw new Error('INSECURE_CONTEXT');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    });
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      throw new DOMException('Cancelled', 'AbortError');
    }
    this.stream = stream;
    this.video = video;
    stream.getVideoTracks().forEach((track) => {
      track.onended = this.onLost;
    });
    navigator.mediaDevices.addEventListener('devicechange', this.deviceListener);
    video.srcObject = stream;
    try {
      await video.play();
      if (generation !== this.generation) throw new DOMException('Cancelled', 'AbortError');
      if (!video.videoWidth)
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            clearTimeout(timeout);
            video.removeEventListener('loadeddata', ready);
            this.cancelReady = undefined;
          };
          const timeout = window.setTimeout(() => {
            cleanup();
            reject(new Error('Camera frame timeout'));
          }, 10000);
          const ready = () => {
            cleanup();
            resolve();
          };
          this.cancelReady = () => {
            cleanup();
            reject(new DOMException('Cancelled', 'AbortError'));
          };
          video.addEventListener('loadeddata', ready, { once: true });
        });
    } catch (error) {
      if (generation === this.generation) this.stop();
      throw error;
    }
  }
  stop() {
    this.generation++;
    this.cancelReady?.();
    if (this.video) this.video.srcObject = null;
    this.video = undefined;
    navigator.mediaDevices?.removeEventListener('devicechange', this.deviceListener);
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.stream = null;
  }
}
