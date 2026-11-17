import type { ServerEvent } from '../../../shared/signaling';
import { SignalingClient } from './SignalingClient';
export type ConnectionStats = {
  fps: number;
  width: number;
  height: number;
  kbps: number;
  rtt: number | null;
  transport: 'ustalanie' | 'P2P' | 'TURN';
  frames: number;
  lost: number;
};
/** Plates read on the computer, shown on the phone (computer → phone only). */
export type PlateFeed = {
  type: 'plates';
  latest?: string;
  plates: { text: string; count: number; at: number }[];
};

/** Parses a plate feed message defensively: only short plate texts and numbers pass. */
export function parsePlateFeed(raw: unknown): PlateFeed | null {
  if (typeof raw !== 'string' || raw.length > 20000) return null;
  try {
    const m = JSON.parse(raw) as PlateFeed;
    const plate = (text: unknown) => typeof text === 'string' && /^[A-Z0-9 ]{1,12}$/.test(text);
    if (m?.type !== 'plates' || !Array.isArray(m.plates) || m.plates.length > 200) return null;
    if (m.latest !== undefined && !plate(m.latest)) return null;
    if (
      !m.plates.every(
        (item) => plate(item?.text) && Number.isSafeInteger(item.count) && Number.isFinite(item.at),
      )
    )
      return null;
    return { type: 'plates', latest: m.latest, plates: m.plates };
  } catch {
    return null;
  }
}

export class PeerConnectionController {
  readonly pc: RTCPeerConnection;
  /**
   * Small messages next to the video (plates read on the computer). Negotiated with a fixed
   * id on both sides, so it is part of the first offer and needs no extra signaling.
   */
  readonly channel: RTCDataChannel;
  generation = 0;
  private queue: (RTCIceCandidateInit | null)[] = [];
  private chain = Promise.resolve();
  private stopped = false;
  private sentDescription = false;
  private outgoing: (RTCIceCandidateInit | null)[] = [];
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private attempts = 0;
  private previous?: { bytes: number; frames: number; time: number };
  private sender?: RTCRtpSender;
  constructor(
    private role: 'owner' | 'phone',
    private signaling: SignalingClient,
    config: ServerEvent,
    onStream: (stream: MediaStream) => void,
    private failure: () => void,
  ) {
    this.pc = new RTCPeerConnection({
      iceServers: config.iceServers ?? [],
      iceTransportPolicy: config.policy ?? 'all',
    });
    this.channel = this.pc.createDataChannel('plates', { negotiated: true, id: 0 });
    this.pc.ontrack = (e) => {
      if (!this.stopped) onStream(e.streams[0] ?? new MediaStream([e.track]));
    };
    this.pc.onicecandidate = (e) => {
      if (this.stopped) return;
      const candidate = e.candidate?.toJSON() ?? null;
      if (!this.sentDescription) this.outgoing.push(candidate);
      else this.signaling.send('ice', { generation: this.generation, candidate });
    };
    this.pc.onconnectionstatechange = () => {
      if (this.stopped) return;
      if (this.pc.connectionState === 'connected') {
        clearTimeout(this.watchdog);
        this.watchdog = undefined;
        this.attempts = 0;
      } else if (this.pc.connectionState === 'failed') this.recover();
      else if (this.pc.connectionState === 'disconnected') {
        // Short Wi-Fi drops often heal by themselves; restart ICE only if they persist.
        clearTimeout(this.watchdog);
        this.watchdog = setTimeout(() => this.recover(), 4000);
      }
    };
    this.watchdog = setTimeout(() => this.recover(), 15000);
  }
  private recover() {
    clearTimeout(this.watchdog);
    if (this.stopped) return;
    if (++this.attempts > 2) {
      this.failure();
      return;
    }
    if (this.role === 'owner') this.signaling.send('restart');
    else this.handle({ type: 'restart' });
    this.watchdog = setTimeout(() => this.recover(), 12000);
  }
  private publish(type: 'offer' | 'answer') {
    this.signaling.send(type, { generation: this.generation, sdp: this.pc.localDescription!.sdp });
    this.sentDescription = true;
    for (const candidate of this.outgoing)
      this.signaling.send('ice', { generation: this.generation, candidate });
    this.outgoing = [];
  }
  async sendStream(stream: MediaStream) {
    if (this.stopped) return;
    const track = stream.getVideoTracks()[0];
    if (this.sender) await this.sender.replaceTrack(track);
    else {
      this.sender = this.pc.addTrack(track, stream);
      await this.offer();
    }
    if (this.stopped) return;
    const params = this.sender.getParameters();
    if (params.encodings?.length) {
      params.encodings[0].maxBitrate = 2000000;
      await this.sender.setParameters(params);
    }
  }
  private async offer() {
    if (this.stopped || this.pc.signalingState !== 'stable') return;
    this.generation++;
    this.queue = [];
    this.sentDescription = false;
    this.outgoing = [];
    await this.pc.setLocalDescription(
      await this.pc.createOffer({ iceRestart: this.generation > 1 }),
    );
    if (!this.stopped) this.publish('offer');
  }
  handle(m: ServerEvent) {
    this.chain = this.chain
      .then(async () => {
        if (this.stopped) return;
        if (m.type === 'restart' && this.role === 'phone') {
          await this.offer();
          return;
        }
        if (m.type === 'offer' && this.role === 'owner') {
          if (m.generation !== this.generation + 1) return;
          this.generation = m.generation;
          this.sentDescription = false;
          this.outgoing = [];
          this.queue = [];
          await this.pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
          await this.pc.setLocalDescription(await this.pc.createAnswer());
          if (!this.stopped) this.publish('answer');
        } else if (m.generation !== this.generation) return;
        else if (m.type === 'answer' && this.role === 'phone') {
          await this.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp });
          for (const c of this.queue) await this.pc.addIceCandidate(c ?? undefined);
          this.queue = [];
        } else if (m.type === 'ice') {
          if (
            this.pc.remoteDescription &&
            (this.role === 'owner' || this.pc.signalingState === 'stable')
          )
            await this.pc.addIceCandidate(m.candidate ?? undefined);
          else if (this.queue.length < 128) this.queue.push(m.candidate ?? null);
          else throw new Error('ICE limit');
        }
      })
      .catch(() => {
        if (!this.stopped) this.failure();
      });
  }
  async stats(): Promise<ConnectionStats> {
    const report = await this.pc.getStats();
    const result: ConnectionStats = {
      fps: 0,
      width: 0,
      height: 0,
      kbps: 0,
      rtt: null,
      transport: 'ustalanie',
      frames: 0,
      lost: 0,
    };
    report.forEach((s) => {
      if (s.type === 'transport' && s.selectedCandidatePairId) {
        const pair = report.get(s.selectedCandidatePairId);
        const local = pair && report.get(pair.localCandidateId),
          remote = pair && report.get(pair.remoteCandidateId);
        if (local && remote)
          result.transport =
            local.candidateType === 'relay' || remote.candidateType === 'relay' ? 'TURN' : 'P2P';
        result.rtt = pair?.currentRoundTripTime != null ? pair.currentRoundTripTime * 1000 : null;
      }
      if (s.type === 'inbound-rtp' && s.kind === 'video') {
        result.width = s.frameWidth ?? 0;
        result.height = s.frameHeight ?? 0;
        result.frames = s.framesDecoded ?? 0;
        result.lost = s.packetsLost ?? 0;
        if (this.previous && s.timestamp > this.previous.time) {
          const delta = s.timestamp - this.previous.time;
          result.fps = ((result.frames - this.previous.frames) * 1000) / delta;
          result.kbps = ((s.bytesReceived - this.previous.bytes) * 8) / delta;
        }
        this.previous = { bytes: s.bytesReceived, frames: result.frames, time: s.timestamp };
      }
    });
    return result;
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.watchdog);
    this.queue = [];
    this.outgoing = [];
    this.pc.ontrack = null;
    this.pc.onicecandidate = null;
    this.pc.onconnectionstatechange = null;
    this.channel.onopen = null;
    this.channel.onmessage = null;
    this.pc.close();
  }
}
