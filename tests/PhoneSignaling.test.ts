import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createSignaling } from '../server/index';
import { RoomRegistry, type Connection } from '../server/RoomRegistry';
import { parseSignal, type ServerEvent, type Signal } from '../shared/signaling';
const msg = (type: string, data: Partial<Signal> = {}): Signal => ({
  v: 1,
  id: crypto.randomUUID(),
  generation: 0,
  type,
  ...data,
});
const client = () => {
  const events: ServerEvent[] = [];
  let closed = false;
  const c: Connection = {
    send: (m) => events.push(m),
    close: () => {
      closed = true;
    },
  };
  return {
    c,
    events,
    get closed() {
      return closed;
    },
  };
};
function pair(r: RoomRegistry) {
  const owner = client(),
    phone = client();
  r.handle(owner.c, msg('create', { name: 'Desk' }));
  const invitation = owner.events[0];
  r.handle(
    phone.c,
    msg('join', { room: invitation.room, secret: invitation.invite, name: 'Phone' }),
  );
  r.handle(owner.c, msg('approve', { attempt: owner.events.at(-1)!.attempt }));
  return { owner, phone, invitation };
}
describe('phone protocol and rooms', () => {
  it('rejects malformed, oversized and extra fields', () => {
    for (const raw of [
      'null',
      '{}',
      'x'.repeat(65537),
      JSON.stringify({ ...msg('leave'), room: 'foreign' }),
      JSON.stringify(msg('offer', { sdp: '' })),
      JSON.stringify(msg('ice', { candidate: { candidate: 5 } as never })),
    ])
      expect(() => parseSignal(raw)).toThrow();
    expect(parseSignal(JSON.stringify(msg('create', { name: 'Desk' }))).type).toBe('create');
  });
  it('uses separate secrets, approves only one contender and prevents invitation replay', () => {
    const r = new RoomRegistry();
    const owner = client(),
      a = client(),
      b = client();
    r.handle(owner.c, msg('create', { name: 'Desk' }));
    const inv = owner.events[0];
    expect(inv.owner).not.toBe(inv.invite);
    expect(inv.invite!.length).toBeGreaterThanOrEqual(32);
    for (const c of [a, b])
      r.handle(c.c, msg('join', { room: inv.room, secret: inv.invite, name: 'Phone' }));
    const first = owner.events[1].attempt!;
    expect(() => r.handle(a.c, msg('approve', { attempt: first }))).toThrow('ROLE');
    r.handle(owner.c, msg('approve', { attempt: first }));
    expect(a.events.at(-1)!.type).toBe('approved');
    expect(b.closed).toBe(true);
    expect(() =>
      r.handle(client().c, msg('join', { room: inv.room, secret: inv.invite, name: 'Replay' })),
    ).toThrow();
    expect(() => r.handle(owner.c, msg('approve', { attempt: first }))).toThrow();
    r.disconnect(owner.c);
    expect(r.rooms.size).toBe(0);
    expect(r.members.size).toBe(0);
    expect(a.closed).toBe(true);
  });
  it('rejects foreign approval, wrong secrets, stale SDP and owner offers', () => {
    const r = new RoomRegistry(),
      a = pair(r),
      b = pair(r);
    expect(() => r.handle(a.owner.c, msg('offer', { generation: 1, sdp: 'sdp' }))).toThrow();
    expect(() => r.handle(a.phone.c, msg('offer', { generation: 3, sdp: 'sdp' }))).toThrow();
    r.handle(a.phone.c, msg('offer', { generation: 1, sdp: 'first' }));
    expect(a.owner.events.at(-1)!.sdp).toBe('first');
    expect(b.owner.events.some((e) => e.sdp)).toBe(false);
    r.handle(a.owner.c, msg('answer', { generation: 1, sdp: 'answer' }));
    const forwarded = a.owner.events.length;
    r.handle(a.phone.c, msg('ice', { generation: 0, candidate: null }));
    expect(a.owner.events).toHaveLength(forwarded);
    expect(r.rooms.size).toBe(2);
    expect(() =>
      r.handle(
        client().c,
        msg('join', { room: b.invitation.room, secret: a.invitation.owner, name: 'Bad' }),
      ),
    ).toThrow();
    r.close();
    expect(r.members.size).toBe(0);
  });
  it('expires pending attempts, invitations and sessions; rejection preserves an invitation', () => {
    let time = 0;
    const r = new RoomRegistry(() => time),
      owner = client(),
      phone = client();
    r.handle(owner.c, msg('create', { name: 'Desk' }));
    const inv = owner.events[0];
    r.handle(phone.c, msg('join', { room: inv.room, secret: inv.invite, name: 'P' }));
    time = 30001;
    r.sweep();
    expect(phone.closed).toBe(true);
    expect(r.rooms.size).toBe(1);
    const replacement = client();
    r.handle(replacement.c, msg('join', { room: inv.room, secret: inv.invite, name: 'P' }));
    r.handle(owner.c, msg('reject', { attempt: owner.events.at(-1)!.attempt }));
    expect(replacement.closed).toBe(true);
    time = 300001;
    r.sweep();
    expect(r.rooms.size).toBe(0);
    const active = pair(r);
    time += 7200001;
    r.sweep();
    expect(active.phone.closed).toBe(true);
    expect(r.members.size).toBe(0);
  });
  it('issues expiring TURN credentials only after approval and bounds restart attempts', () => {
    const r = new RoomRegistry(() => 100000, {
      urls: 'turn:relay.example.test:3478',
      secret: 'server-only-secret',
      relay: true,
    });
    const p = pair(r);
    const e = p.phone.events.at(-1)!;
    expect(e.policy).toBe('relay');
    expect(e.iceServers![0].username).toMatch(/^7600:/);
    expect(JSON.stringify(e)).not.toContain('server-only-secret');
    for (let i = 0; i < 3; i++) r.handle(p.owner.c, msg('restart'));
    expect(r.rooms.size).toBe(0);
  });
  it('allows occasional restarts over a long session but ends rapid restart loops', () => {
    let now = 0;
    const r = new RoomRegistry(() => now);
    const p = pair(r);
    for (let i = 0; i < 4; i++) {
      r.handle(p.owner.c, msg('restart'));
      now += 31000;
    }
    expect(r.rooms.size).toBe(1);
    now += 60000;
    for (let i = 0; i < 3; i++) r.handle(p.owner.c, msg('restart'));
    expect(r.rooms.size).toBe(0);
  });
  it('drops late answers and candidates from a superseded negotiation', () => {
    const r = new RoomRegistry(),
      { owner, phone } = pair(r);
    r.handle(phone.c, msg('offer', { generation: 1, sdp: 'first' }));
    r.handle(owner.c, msg('answer', { generation: 1, sdp: 'answer' }));
    r.handle(phone.c, msg('offer', { generation: 2, sdp: 'restart' }));
    const phoneEvents = phone.events.length,
      ownerEvents = owner.events.length;
    r.handle(owner.c, msg('ice', { generation: 1, candidate: null }));
    r.handle(phone.c, msg('ice', { generation: 1, candidate: null }));
    r.handle(owner.c, msg('answer', { generation: 1, sdp: 'late' }));
    expect(phone.events).toHaveLength(phoneEvents);
    expect(owner.events).toHaveLength(ownerEvents);
    r.handle(owner.c, msg('answer', { generation: 2, sdp: 'current' }));
    expect(phone.events.at(-1)!.sdp).toBe('current');
    expect(() => r.handle(phone.c, msg('answer', { generation: 2, sdp: 'x' }))).toThrow('ROLE');
    r.close();
  });
});

describe('real WebSocket signaling', () => {
  it('isolates 30 rooms / 60 sockets and cleans all connections', async () => {
    const app = createSignaling('http://localhost:5173');
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const address = app.server.address() as { port: number };
    const sockets: WebSocket[] = [];
    async function connect() {
      const ws = new WebSocket(`ws://127.0.0.1:${address.port}/ws`, {
        origin: 'http://localhost:5173',
      });
      sockets.push(ws);
      await new Promise<void>((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
      });
      return ws;
    }
    const next = (ws: WebSocket) =>
      new Promise<ServerEvent>((resolve) =>
        ws.once('message', (data) => resolve(JSON.parse(data.toString()))),
      );
    const send = (ws: WebSocket, type: string, data: Partial<Signal> = {}) =>
      ws.send(JSON.stringify(msg(type, data)));
    try {
      for (let i = 0; i < 30; i++) {
        const owner = await connect();
        let response = next(owner);
        send(owner, 'create', { name: `Desk ${i}` });
        const inv = await response;
        const phone = await connect();
        response = next(owner);
        const waiting = next(phone);
        send(phone, 'join', { room: inv.room, secret: inv.invite, name: 'Phone' });
        const request = await response;
        await waiting;
        const approved = next(phone);
        response = next(owner);
        send(owner, 'approve', { attempt: request.attempt });
        await approved;
        await response;
        response = next(owner);
        send(phone, 'offer', { generation: 1, sdp: `room-${i}` });
        expect((await response).sdp).toBe(`room-${i}`);
        response = next(phone);
        send(owner, 'answer', { generation: 1, sdp: `answer-${i}` });
        expect((await response).sdp).toBe(`answer-${i}`);
      }
      expect(app.registry.rooms.size).toBe(30);
      expect(app.registry.members.size).toBe(60);
    } finally {
      sockets.forEach((ws) => ws.terminate());
      await app.close();
    }
    expect(app.registry.members.size).toBe(0);
  }, 20000);
  it('limits sockets and manual code guesses per forwarded client address', async () => {
    const app = createSignaling('http://localhost:5173');
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const port = (app.server.address() as { port: number }).port;
    const sockets: WebSocket[] = [];
    const open = async (client?: string) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
        origin: 'http://localhost:5173',
        headers: client ? { 'x-forwarded-for': `203.0.113.99, ${client}` } : {},
      });
      sockets.push(ws);
      const opened = await new Promise<boolean>((resolve) => {
        ws.once('open', () => resolve(true));
        ws.once('error', () => resolve(false));
      });
      return opened ? ws : null;
    };
    const reply = (ws: WebSocket, type: string, data: Partial<Signal>) => {
      const response = new Promise<ServerEvent>((resolve) =>
        ws.once('message', (raw) => resolve(JSON.parse(raw.toString()))),
      );
      ws.send(JSON.stringify(msg(type, data)));
      return response;
    };
    try {
      const owner = (await open())!;
      const { code } = await reply(owner, 'create', { name: 'Desk' });
      for (let i = 0; i < 10; i++) expect(await open('198.51.100.1')).not.toBe(null);
      expect(await open('198.51.100.1')).toBe(null);
      for (let i = 0; i < 10; i++) {
        const guesser = (await open('198.51.100.2'))!;
        expect((await reply(guesser, 'join-code', { code: 'AAAAAA', name: 'Guess' })).type).toBe(
          'error',
        );
      }
      const limited = (await open('198.51.100.2'))!;
      expect((await reply(limited, 'join-code', { code, name: 'Phone' })).type).toBe('error');
      const phone = (await open('198.51.100.3'))!;
      expect((await reply(phone, 'join-code', { code, name: 'Phone' })).type).toBe('waiting');
    } finally {
      sockets.forEach((ws) => ws.terminate());
      await app.close();
    }
  });
  it('rejects foreign Origin and drops an unauthenticated protocol violation', async () => {
    const app = createSignaling('http://localhost:5173');
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const port = (app.server.address() as { port: number }).port;
    try {
      const bad = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: 'https://evil.test' });
      await new Promise<void>((resolve) => bad.once('error', () => resolve()));
      expect(app.registry.rooms.size).toBe(0);
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: 'http://localhost:5173' });
      await new Promise<void>((resolve) => ws.once('open', resolve));
      const closed = new Promise<void>((resolve) => ws.once('close', () => resolve()));
      ws.send(JSON.stringify(msg('approve', { attempt: 'foreign' })));
      await closed;
      expect(app.registry.members.size).toBe(0);
    } finally {
      await app.close();
    }
  });
});

it('manual codes are unique, single-use and require explicit approval', () => {
  const r = new RoomRegistry();
  const a = client(),
    b = client(),
    phone = client();
  r.handle(a.c, msg('create', { name: 'A' }));
  r.handle(b.c, msg('create', { name: 'B' }));
  const code = a.events[0].code!;
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  expect(code).not.toBe(b.events[0].code);
  r.handle(phone.c, msg('join-code', { code, name: 'Android' }));
  expect(phone.events.at(-1)!.type).toBe('waiting');
  expect(() => r.handle(phone.c, msg('offer', { generation: 1, sdp: 'x' }))).toThrow();
  r.handle(a.c, msg('approve', { attempt: a.events.at(-1)!.attempt }));
  expect(() => r.handle(client().c, msg('join-code', { code, name: 'Replay' }))).toThrow();
  r.close();
});
it('resumes only approved members with their private token within the grace period', () => {
  let now = 0;
  const r = new RoomRegistry(() => now);
  const { owner, phone, invitation } = pair(r);
  const resume = phone.events.at(-1)!.resume!;
  r.detach(phone.c);
  expect(owner.events.at(-1)!.type).toBe('reconnecting');
  expect(() =>
    r.handle(client().c, msg('resume', { room: invitation.room, resume: invitation.invite })),
  ).toThrow();
  const next = client();
  r.handle(next.c, msg('resume', { room: invitation.room, resume }));
  expect(next.events.at(-1)!.type).toBe('approved');
  expect(phone.closed).toBe(true);
  expect(() => r.handle(phone.c, msg('offer', { generation: 1, sdp: 'stale' }))).toThrow();
  r.handle(next.c, msg('offer', { generation: 1, sdp: 'fresh' }));
  r.detach(next.c);
  now = 60001;
  r.sweep();
  expect(r.rooms.size).toBe(0);
  expect(() => r.handle(client().c, msg('resume', { room: invitation.room, resume }))).toThrow();
});
it('resume takes over a socket the server still considers open', () => {
  const r = new RoomRegistry();
  const { owner, phone, invitation } = pair(r);
  const resume = phone.events.at(-1)!.resume!;
  const next = client();
  r.handle(next.c, msg('resume', { room: invitation.room, resume }));
  expect(phone.closed).toBe(true);
  expect(next.events.at(-1)!.type).toBe('approved');
  expect(owner.events.at(-1)!.type).toBe('approved');
  r.detach(phone.c);
  expect(r.rooms.size).toBe(1);
  r.handle(next.c, msg('offer', { generation: 1, sdp: 'fresh' }));
  expect(owner.events.at(-1)!.sdp).toBe('fresh');
  r.close();
});
it('new pairing revokes the previous device and resume token', () => {
  const r = new RoomRegistry();
  const { owner, phone, invitation } = pair(r);
  const resume = phone.events.at(-1)!.resume!;
  r.handle(owner.c, msg('leave'));
  expect(phone.closed).toBe(true);
  expect(() => r.handle(client().c, msg('resume', { room: invitation.room, resume }))).toThrow();
  r.close();
});

it('rate limits manual guesses across sockets and releases the window', () => {
  let now = 0;
  const r = new RoomRegistry(() => now);
  const owner = client();
  r.handle(owner.c, msg('create', { name: 'Desk' }));
  for (let i = 0; i < 120; i++)
    expect(() =>
      r.handle(client().c, msg('join-code', { code: 'AAAAAA', name: 'Guess' })),
    ).toThrow();
  expect(() =>
    r.handle(client().c, msg('join-code', { code: owner.events[0].code, name: 'Phone' })),
  ).toThrow('RATE');
  now = 60001;
  const phone = client();
  r.handle(phone.c, msg('join-code', { code: owner.events[0].code, name: 'Phone' }));
  expect(phone.events.at(-1)!.type).toBe('waiting');
  r.close();
});
it('counts only wrong manual codes towards the shared limit', () => {
  const r = new RoomRegistry();
  for (let i = 0; i < 150; i++) {
    const owner = client();
    r.handle(owner.c, msg('create', { name: 'Desk' }));
    const phone = client();
    r.handle(phone.c, msg('join-code', { code: owner.events[0].code, name: 'Phone' }));
    expect(phone.events.at(-1)!.type).toBe('waiting');
    r.handle(owner.c, msg('leave'));
  }
  r.close();
});
it('limits wrong codes per client address even without a socket limit', async () => {
  const app = createSignaling('http://localhost:5173', undefined, 0);
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = (app.server.address() as { port: number }).port;
  const sockets: WebSocket[] = [];
  const open = async (address?: string) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      origin: 'http://localhost:5173',
      headers: address ? { 'x-forwarded-for': address } : {},
    });
    sockets.push(ws);
    await new Promise((resolve) => ws.once('open', resolve));
    return ws;
  };
  const reply = (ws: WebSocket, type: string, data: Partial<Signal>) => {
    const response = new Promise<ServerEvent>((resolve) =>
      ws.once('message', (raw) => resolve(JSON.parse(raw.toString()))),
    );
    ws.send(JSON.stringify(msg(type, data)));
    return response;
  };
  try {
    const owner = await open();
    const { code } = await reply(owner, 'create', { name: 'Desk' });
    for (let i = 0; i < 10; i++)
      expect(
        (await reply(await open('198.51.100.7'), 'join-code', { code: 'AAAAAA', name: 'G' })).type,
      ).toBe('error');
    expect((await reply(await open('198.51.100.7'), 'join-code', { code, name: 'P' })).type).toBe(
      'error',
    );
    expect((await reply(await open('198.51.100.8'), 'join-code', { code, name: 'P' })).type).toBe(
      'waiting',
    );
  } finally {
    sockets.forEach((ws) => ws.terminate());
    await app.close();
  }
});
it('matches an Origin without the default port and serves a normalized public origin', async () => {
  const app = createSignaling('https://lab.example.test:443');
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = (app.server.address() as { port: number }).port;
  try {
    const config = await fetch(`http://127.0.0.1:${port}/api/phone-config`).then((r) => r.json());
    expect(config.publicOrigin).toBe('https://lab.example.test');
    const open = (origin: string) =>
      new Promise<boolean>((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin });
        ws.once('open', () => {
          ws.terminate();
          resolve(true);
        });
        ws.once('error', () => resolve(false));
      });
    expect(await open('https://lab.example.test')).toBe(true);
    expect(await open('https://lab.example.test:3000')).toBe(false);
  } finally {
    await app.close();
  }
});
