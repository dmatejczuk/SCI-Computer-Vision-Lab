export interface VideoSource {
  readonly kind: 'local' | 'phone';
  stream: MediaStream | null;
  readonly label: string;
  start(video: HTMLVideoElement, deviceId?: string): Promise<void>;
  stop(): void;
}
