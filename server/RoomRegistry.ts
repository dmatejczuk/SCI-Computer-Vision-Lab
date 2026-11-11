import { randomBytes, randomInt, timingSafeEqual, createHmac } from 'node:crypto';
import type { Signal, ServerEvent } from '../shared/signaling.ts';
export interface Connection {
  send(m: ServerEvent): void;
  close(): void;
}
type Member = { room: Room; role: 'owner' | 'pending' | 'phone'; attempt?: string };
type Pending = { connection: Connection; expires: number; code: string; name: string };
type Room = {
  id: string;
  ownerSecret: string;
  phoneSecret: string;
  joinCode: string;
  detached: Map<Connection, number>;
  invite: string;
  owner: Connection;
  name: string;
  expires: number;
  invitationExpires: number;
  pending: Map<string, Pending>;
  phone?: Connection;
  generation: number;
  awaitingAnswer: boolean;
  answered: boolean;
  restarts: number[];
};
const token = () => randomBytes(24).toString('base64url');
const equal = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export class RoomRegistry {
  rooms = new Map<string, Room>();
  members = new Map<Connection, Member>();
  private codeAttempts: number[] = [];
  constructor(
    private now = Date.now,
    private turn = {
      urls: process.env.TURN_URLS ?? '',
      secret: process.env.TURN_SECRET ?? '',
      relay: process.env.ICE_RELAY_ONLY === 'true',
    },
  ) {}
  private ice(): Pick<ServerEvent, 'iceServers' | 'policy'> {
    const username = `${Math.floor(this.now() / 1000) + 7500}:${token()}`;
    return {
      policy: this.turn.relay ? 'relay' : 'all',
      iceServers:
        this.turn.urls && this.turn.secret
          ? [
              {
                urls: this.turn.urls.split(','),
                username,
                credential: createHmac('sha1', this.turn.secret).update(username).digest('base64'),
              },
            ]
          : [],
    };
  }
  handle(c: Connection, m: Signal) {
    this.sweep();
    const member = this.members.get(c);
    if (m.type === 'resume' && !member) {
      const room = this.rooms.get(m.room!);
      if (!room) throw new Error('AUTH');
      const role = equal(room.ownerSecret, m.resume!)
        ? 'owner'
        : room.phoneSecret && equal(room.phoneSecret, m.resume!)
          ? 'phone'
          : null;
      if (!role) throw new Error('AUTH');
      // The previous socket may still look open (half-open TCP after a network change).
      const old = role === 'owner' ? room.owner : room.phone;
      if (!old) throw new Error('AUTH');
      room.detached.delete(old);
      this.members.delete(old);
      if (role === 'owner') room.owner = c;
      else room.phone = c;
      this.members.set(c, { room, role });
      old.close();
      if (room.phone && room.detached.size === 0) {
        room.generation = 0;
        room.awaitingAnswer = false;
        room.answered = false;
        room.restarts = [];
        const config = this.ice();
        room.owner.send({ type: 'approved', room: room.id, resume: room.ownerSecret, ...config });
        room.phone.send({ type: 'approved', room: room.id, resume: room.phoneSecret, ...config });
      } else c.send({ type: 'reconnecting' });
      return;
    }
    if (m.type === 'create' && !member) {
      if (this.rooms.size >= 60) throw new Error('CAPACITY');
      const room: Room = {
        id: token(),
        ownerSecret: token(),
        phoneSecret: '',
        joinCode: this.newCode(),
        detached: new Map(),
        invite: token(),
        owner: c,
        name: m.name!,
        expires: this.now() + 7200000,
        invitationExpires: this.now() + 300000,
        pending: new Map(),
        generation: 0,
        awaitingAnswer: false,
        answered: false,
        restarts: [],
      };
      this.rooms.set(room.id, room);
      this.members.set(c, { room, role: 'owner' });
      c.send({
        type: 'created',
        room: room.id,
        owner: room.ownerSecret,
        code: room.joinCode,
        invite: room.invite,
        expires: room.invitationExpires,
        name: room.name,
      });
      return;
    }
    if ((m.type === 'join' || m.type === 'join-code') && !member) {
      if (m.type === 'join-code') {
        this.codeAttempts = this.codeAttempts.filter((t) => t > this.now() - 60000);
        if (this.codeAttempts.length >= 120) throw new Error('RATE');
        this.codeAttempts.push(this.now());
      }
      const room =
        m.type === 'join'
          ? this.rooms.get(m.room!)
          : [...this.rooms.values()].find((r) => r.joinCode === m.code);
      if (
        !room ||
        room.phone ||
        !room.invite ||
        room.invitationExpires <= this.now() ||
        (m.type === 'join' && !equal(room.invite, m.secret!)) ||
        room.detached.size > 0 ||
        room.pending.size >= 3
      )
        throw new Error('INVITATION');
      const attempt = token(),
        code = String(randomInt(100000, 1000000));
      room.pending.set(attempt, {
        connection: c,
        expires: this.now() + 30000,
        code,
        name: m.name!,
      });
      this.members.set(c, { room, role: 'pending', attempt });
      c.send({ type: 'waiting', code, name: room.name });
      room.owner.send({ type: 'request', attempt, code, name: m.name });
      return;
    }
    if (!member) throw new Error('AUTH');
    const r = member.room;
    if (m.type === 'leave') {
      this.disconnect(c);
      return;
    }
    if (m.type === 'heartbeat') {
      c.send({ type: 'heartbeat' });
      return;
    }
    if (m.type === 'approve' || m.type === 'reject') {
      if (member.role !== 'owner' || r.phone) throw new Error('ROLE');
      const p = r.pending.get(m.attempt!);
      if (!p) throw new Error('ATTEMPT');
      if (m.type === 'reject') {
        this.removePending(r, m.attempt!);
        return;
      }
      r.phone = p.connection;
      r.invite = '';
      r.joinCode = '';
      r.phoneSecret = token();
      this.members.set(p.connection, { room: r, role: 'phone' });
      r.pending.delete(m.attempt!);
      for (const id of r.pending.keys()) this.removePending(r, id);
      const config = this.ice();
      r.owner.send({
        type: 'approved',
        room: r.id,
        resume: r.ownerSecret,
        name: p.name,
        ...config,
      });
      r.phone.send({ type: 'approved', room: r.id, resume: r.phoneSecret, ...config });
      return;
    }
    if (member.role === 'pending' || !r.phone) throw new Error('STATE');
    if (m.type === 'restart') {
      r.restarts = r.restarts.filter((t) => t > this.now() - 60000);
      if (r.restarts.push(this.now()) > 2) {
        this.end(r);
        return;
      }
      r.phone.send({ type: 'restart' });
      return;
    }
    if (m.type === 'offer') {
      if (member.role !== 'phone' || m.generation !== r.generation + 1 || r.awaitingAnswer)
        throw new Error('GENERATION');
      r.generation = m.generation;
      r.awaitingAnswer = true;
      r.answered = false;
    } else if (m.type === 'answer') {
      if (member.role !== 'owner') throw new Error('ROLE');
      // Late answers and candidates from a superseded negotiation are expected after a
      // restart or resume. Drop them instead of ending the room.
      if (!r.awaitingAnswer || m.generation !== r.generation) return;
      r.awaitingAnswer = false;
      r.answered = true;
    } else if (m.type === 'ice') {
      if (m.generation !== r.generation || r.generation === 0) return;
      if (member.role === 'owner' && !r.answered) throw new Error('GENERATION');
    } else throw new Error('STATE');
    (member.role === 'owner' ? r.phone : r.owner).send({
      type: m.type,
      generation: m.generation,
      ...(m.sdp ? { sdp: m.sdp } : { candidate: m.candidate }),
    });
  }
  private newCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
    return [...this.rooms.values()].some((r) => r.joinCode === code) ? this.newCode() : code;
  }
  detach(c: Connection) {
    const m = this.members.get(c);
    if (!m) return;
    if (m.role === 'pending' || !m.room.phone) {
      this.disconnect(c);
      return;
    }
    m.room.detached.set(c, this.now() + 60000);
    (m.role === 'owner' ? m.room.phone : m.room.owner)?.send({ type: 'reconnecting' });
  }
  private removePending(r: Room, id: string) {
    const p = r.pending.get(id);
    if (!p) return;
    r.pending.delete(id);
    this.members.delete(p.connection);
    p.connection.send({ type: 'ended' });
    p.connection.close();
    r.owner.send({ type: 'withdrawn', attempt: id });
  }
  private end(r: Room) {
    if (!this.rooms.delete(r.id)) return;
    for (const id of r.pending.keys()) this.removePending(r, id);
    for (const c of [r.owner, r.phone])
      if (c) {
        this.members.delete(c);
        c.send({ type: 'ended' });
        c.close();
      }
    r.invite = '';
    r.ownerSecret = '';
  }
  disconnect(c: Connection) {
    const m = this.members.get(c);
    if (!m) return;
    if (m.role === 'pending') this.removePending(m.room, m.attempt!);
    else this.end(m.room);
  }
  sweep() {
    for (const r of this.rooms.values()) {
      if (
        [...r.detached.values()].some((t) => t <= this.now()) ||
        r.expires <= this.now() ||
        (!r.phone && r.invitationExpires <= this.now())
      ) {
        this.end(r);
        continue;
      }
      for (const [id, p] of r.pending) if (p.expires <= this.now()) this.removePending(r, id);
    }
  }
  close() {
    for (const r of this.rooms.values()) this.end(r);
  }
}
