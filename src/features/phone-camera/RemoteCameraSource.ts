import { deviceName } from './deviceName';
import type { VideoSource } from '../camera/VideoSource';
import type { ServerEvent } from '../../../shared/signaling';
import { SignalingClient } from './SignalingClient';
import {
  PeerConnectionController,
  type ConnectionStats,
  type PlateFeed,
} from './PeerConnectionController';
export type PairingState = {
  status: string;
  code: string;
  link: string;
  expires: number;
  requests: ServerEvent[];
  stats?: ConnectionStats;
  playback: boolean;
};
export class RemoteCameraSource implements VideoSource {
  readonly kind = 'phone';
  stream: MediaStream | null = null;
  readonly label = 'Telefon';
  private generation = 0;
  private signaling?: SignalingClient;
  private peer?: PeerConnectionController;
  private video?: HTMLVideoElement;
  private timer?: ReturnType<typeof setInterval>;
  private cancel?: () => void;
  private ready?: () => void;
  private listeners = new Set<() => void>();
  /** The latest plate collection, re-sent whenever the data channel (re)opens. */
  private plates: PlateFeed = { type: 'plates', plates: [] };
  private state: PairingState = {
    code: '',
    status: 'Wybierz telefon i rozpocznij parowanie.',
    link: '',
    expires: 0,
    requests: [],
    playback: false,
  };
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.state;
  private patch(p: Partial<PairingState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((fn) => fn());
  }
  constructor(
    private lost: () => void,
    private restored: () => void = () => {},
  ) {}
  async start(video: HTMLVideoElement) {
    this.stop();
    const generation = this.generation;
    this.video = video;
    this.patch({ status: 'Tworzenie zaproszenia…', link: '', requests: [], stats: undefined });
    const config = await fetch('/api/phone-config').then((r) => {
      if (!r.ok) throw new Error('Serwer telefonu jest niedostępny.');
      return r.json();
    });
    if (generation !== this.generation) throw new DOMException('Cancelled', 'AbortError');
    const origin = new URL(config.publicOrigin);
    if (
      origin.protocol !== 'https:' ||
      ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) ||
      origin.hostname.endsWith('.localhost') ||
      !origin.hostname.includes('.')
    ) {
      this.patch({
        status:
          'Telefon wymaga adresu HTTPS dostępnego w sieci. Uruchom scripts/start-lan.ps1 i otwórz wskazany adres na komputerze.',
      });
      throw new Error('Telefon wymaga sieciowego HTTPS.');
    }
    const ready = new Promise<void>((resolve, reject) => {
      this.ready = resolve;
      this.cancel = () =>
        reject(new DOMException('Połączenie zakończone. Sparuj ponownie.', 'AbortError'));
    });
    const lost = () => {
      if (generation !== this.generation) return;
      this.stop();
      this.patch({ status: 'Połączenie przerwane. Wybierz ponowne parowanie.' });
      this.lost();
    };
    const signaling = new SignalingClient((m) => {
      if (generation !== this.generation) return;
      if (m.type === 'created') {
        const link = new URL('/phone', origin);
        link.hash = new URLSearchParams({ room: m.room!, invite: m.invite! }).toString();
        this.patch({
          status: 'Zeskanuj kod telefonem. Zaproszenie jest jednorazowe.',
          link: link.href,
          code: m.code ?? '',
          expires: m.expires!,
        });
      } else if (m.type === 'request')
        this.patch({
          requests: [...this.state.requests, m],
          status: 'Porównaj kod na obu ekranach i zatwierdź telefon.',
        });
      else if (m.type === 'withdrawn')
        this.patch({ requests: this.state.requests.filter((p) => p.attempt !== m.attempt) });
      else if (m.type === 'reconnecting') {
        this.releasePeer();
        this.patch({ status: 'Przerwa w połączeniu z telefonem. Łączymy ponownie…' });
      } else if (m.type === 'approved') {
        // A resumed session renegotiates from scratch; the previous peer must not linger.
        this.releasePeer();
        this.patch({
          link: '',
          code: '',
          requests: [],
          status: 'Telefon zatwierdzony. Uruchom na nim aparat.',
        });
        this.peer = new PeerConnectionController(
          'owner',
          signaling,
          m,
          (stream) => {
            if (generation !== this.generation) {
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
            if (this.stream && this.stream !== stream)
              this.stream.getTracks().forEach((t) => {
                t.onended = null;
                t.stop();
              });
            this.stream = stream;
            video.srcObject = stream;
            stream.getTracks().forEach((t) => {
              t.onended = lost;
            });
            void this.play();
          },
          lost,
        );
        // The phone shows the plates read so far as soon as the channel opens.
        this.peer.channel.onopen = () => this.sendPlates(this.plates);
        this.timer = setInterval(() => {
          const peer = this.peer;
          if (peer)
            void peer
              .stats()
              .then((stats) => {
                if (generation === this.generation) this.patch({ stats });
              })
              .catch(lost);
        }, 1000);
      } else if (m.type === 'ended' || m.type === 'error') lost();
      else this.peer?.handle(m);
    }, lost);
    this.signaling = signaling;
    void signaling.ready
      .then(() => {
        if (generation === this.generation)
          signaling.send('create', {
            name: deviceName(),
          });
      })
      .catch(lost);
    await ready;
  }
  async play() {
    const generation = this.generation;
    try {
      await this.video?.play();
      if (generation !== this.generation) return;
      this.patch({ playback: false, status: 'Połączono kamerę telefonu.' });
      this.restored();
      this.ready?.();
      this.ready = undefined;
      this.cancel = undefined;
    } catch {
      if (generation === this.generation)
        this.patch({
          playback: true,
          status: 'Przeglądarka zatrzymała podgląd. Naciśnij Odtwórz obraz.',
        });
    }
  }
  private releasePeer() {
    clearInterval(this.timer);
    // Tracks of a closed peer end; that is a planned renegotiation, not a lost source.
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
    });
    this.peer?.stop();
    this.peer = undefined;
  }
  /** Shows plates read on the computer on the paired phone (if one is connected). */
  publishPlates(feed: Omit<PlateFeed, 'type'>) {
    // Only the newest plate is announced; a later re-send carries the collection alone.
    this.plates = { type: 'plates', plates: feed.plates };
    this.sendPlates({ type: 'plates', ...feed });
  }
  private sendPlates(feed: PlateFeed) {
    const channel = this.peer?.channel;
    if (channel?.readyState === 'open') channel.send(JSON.stringify(feed));
  }
  markRecovered() {
    this.patch({ status: 'Przywrócono obraz telefonu.' });
  }
  approve(attempt: string) {
    this.signaling?.send('approve', { attempt });
  }
  reject(attempt: string) {
    this.signaling?.send('reject', { attempt });
  }
  stop() {
    this.generation++;
    this.cancel?.();
    this.cancel = undefined;
    this.ready = undefined;
    clearInterval(this.timer);
    this.peer?.stop();
    this.peer = undefined;
    this.signaling?.stop();
    this.signaling = undefined;
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.patch({
      link: '',
      code: '',
      requests: [],
      playback: false,
      stats: undefined,
      status: 'Transmisja zatrzymana. Możesz sparować telefon ponownie.',
    });
  }
}
