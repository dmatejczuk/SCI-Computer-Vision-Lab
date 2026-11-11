import type { Signal, ServerEvent } from '../../../shared/signaling';
export class SignalingClient {
  private socket!: WebSocket;
  private stopped = false;
  private resume?: { room: string; resume: string };
  private retry?: ReturnType<typeof setTimeout>;
  private deadline = 0;
  private connectTimer?: ReturnType<typeof setTimeout>;
  private attempts = 0;
  readonly ready: Promise<void>;
  constructor(
    private event: (m: ServerEvent) => void,
    private lost: () => void,
  ) {
    this.ready = new Promise((resolve, reject) => this.connect(resolve, reject));
  }
  private connect(resolve = () => {}, reject: (error: Error) => void = () => {}) {
    if (this.stopped) return;
    const url = new URL('/ws', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = (this.socket = new WebSocket(url));
    this.connectTimer = setTimeout(() => {
      if (socket.readyState === WebSocket.CONNECTING) socket.close();
    }, 8000);
    socket.onopen = () => {
      clearTimeout(this.connectTimer);
      if (this.stopped) {
        socket.close();
        return;
      }
      if (this.resume) this.send('resume', this.resume);
      resolve();
    };
    socket.onerror = () =>
      reject(new Error('Nie można połączyć z serwerem. Sprawdź sieć i certyfikat strony.'));
    socket.onmessage = (e) => {
      if (this.stopped || socket !== this.socket) return;
      try {
        const m = JSON.parse(e.data) as ServerEvent;
        if (m.type === 'approved' && m.room && m.resume) {
          this.resume = { room: m.room, resume: m.resume };
          this.deadline = 0;
          this.attempts = 0;
        }
        if (m.type === 'ended' || m.type === 'error') this.resume = undefined;
        this.event(m);
      } catch {
        this.lost();
      }
    };
    socket.onclose = () => {
      clearTimeout(this.connectTimer);
      if (this.stopped || socket !== this.socket) return;
      if (this.resume) {
        if (!this.deadline) this.deadline = Date.now() + 55000;
        if (Date.now() < this.deadline) {
          this.event({ type: 'reconnecting' });
          this.retry = setTimeout(() => this.connect(), Math.min(500 * 2 ** this.attempts++, 5000));
          return;
        }
      }
      this.lost();
    };
  }
  send(type: string, data: Partial<Signal> = {}) {
    if (this.stopped || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(
      JSON.stringify({ v: 1, id: crypto.randomUUID(), generation: 0, ...data, type }),
    );
  }
  stop() {
    this.send('leave');
    this.stopped = true;
    this.resume = undefined;
    clearTimeout(this.retry);
    clearTimeout(this.connectTimer);
    this.socket.onmessage = null;
    this.socket.onclose = null;
    this.socket.close();
  }
}
