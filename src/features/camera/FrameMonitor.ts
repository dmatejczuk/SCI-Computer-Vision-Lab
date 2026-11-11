// A live track is not proof of fresh frames. All consumers check this clock.
export class FrameMonitor {
  private last = -Infinity;
  private sequence = -1;
  private callback = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private video?: HTMLVideoElement;
  private lost = false;
  constructor(
    private onLost: () => void,
    private now = () => performance.now(),
    private onFresh: () => void = () => {},
  ) {}
  get fresh() {
    return this.now() - this.last < 2000;
  }
  mark(sequence: number) {
    if (sequence !== this.sequence) {
      this.sequence = sequence;
      this.last = this.now();
      this.onFresh();
    }
  }
  start(video: HTMLVideoElement) {
    this.stop();
    this.video = video;
    this.last = this.now();
    this.lost = false;
    const frame: VideoFrameRequestCallback = (_, metadata) => {
      if (this.video !== video) return;
      this.mark(metadata.presentedFrames);
      this.callback = video.requestVideoFrameCallback(frame);
    };
    if (video.requestVideoFrameCallback) this.callback = video.requestVideoFrameCallback(frame);
    this.timer = setInterval(() => {
      if (!video.requestVideoFrameCallback)
        this.mark(video.getVideoPlaybackQuality?.().totalVideoFrames ?? video.currentTime);
      if (!this.fresh && !this.lost) {
        this.lost = true;
        this.onLost();
      }
      if (this.fresh) this.lost = false;
    }, 250);
  }
  stop() {
    if (this.callback) this.video?.cancelVideoFrameCallback?.(this.callback);
    clearInterval(this.timer);
    this.video = undefined;
    this.callback = 0;
    this.last = -Infinity;
    this.sequence = -1;
  }
}
