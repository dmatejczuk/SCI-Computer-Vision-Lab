import { createServer, type IncomingMessage } from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { RoomRegistry, type Connection } from './RoomRegistry.ts';
import { parseSignal } from '../shared/signaling.ts';
// Caddy, the only route to this port in Docker, replaces X-Forwarded-For with the client address.
// Direct loopback connections without it are local development and tests and are not limited per client.
function clientAddress(req: IncomingMessage): string | null {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '')
    .split(',')
    .at(-1)
    ?.trim();
  if (forwarded) return forwarded;
  const remote = req.socket.remoteAddress ?? '';
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote) ? null : remote;
}
export function createSignaling(
  origin = process.env.APP_ORIGIN ?? 'http://localhost:5173',
  publicOrigin = process.env.PUBLIC_ORIGIN ?? origin,
  // 0 disables per-client limits, e.g. for a public server reached by a whole school behind one NAT.
  clientLimit = Number(process.env.CLIENT_SOCKET_LIMIT ?? 10),
) {
  const registry = new RoomRegistry();
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && req.url === '/api/health') {
      res.end('{"ok":true}');
      return;
    }
    if (req.method === 'GET' && req.url === '/api/phone-config') {
      res.end(JSON.stringify({ publicOrigin }));
      return;
    }
    res.writeHead(404);
    res.end('{"error":"Not found"}');
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 65536, perMessageDeflate: false });
  const arrivals: number[] = [];
  // One client (e.g. a student's laptop) must not exhaust the shared room and socket capacity.
  const sockets = new Map<string, number>(),
    recent = new Map<string, number[]>();
  const allow = (key: string, limit: number) => {
    const now = Date.now(),
      times = (recent.get(key) ?? []).filter((t) => t > now - 60000);
    recent.set(key, times);
    if (times.length >= limit) return false;
    times.push(now);
    return true;
  };
  server.on('upgrade', (req, socket, head) => {
    const now = Date.now(),
      client = clientLimit > 0 ? clientAddress(req) : null;
    while (arrivals.length && arrivals[0] < now - 60000) arrivals.shift();
    if (
      req.url !== '/ws' ||
      req.headers.origin !== origin ||
      wss.clients.size >= 180 ||
      arrivals.length >= 240 ||
      (client !== null &&
        ((sockets.get(client) ?? 0) >= clientLimit || !allow(`upgrade:${client}`, 30)))
    ) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    arrivals.push(now);
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, client));
  });
  wss.on('connection', (ws: WebSocket, client: string | null) => {
    if (client !== null) sockets.set(client, (sockets.get(client) ?? 0) + 1);
    let windowStart = Date.now(),
      messages = 0,
      alive = true;
    const ids = new Set<string>();
    const c: Connection = {
      send: (m) => {
        if (ws.readyState === WebSocket.OPEN) {
          if (ws.bufferedAmount > 262144) ws.terminate();
          else ws.send(JSON.stringify(m));
        }
      },
      close: () => {
        ws.close(1000);
        setTimeout(() => ws.terminate(), 1000).unref();
      },
    };
    const auth = setTimeout(() => {
      if (!registry.members.has(c)) ws.terminate();
    }, 5000);
    const heartbeat = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, 10000);
    ws.on('pong', () => {
      alive = true;
    });
    ws.on('message', (data, binary) => {
      try {
        if (binary) throw new Error('BINARY');
        if (Date.now() - windowStart > 10000) {
          windowStart = Date.now();
          messages = 0;
          ids.clear();
        }
        if (++messages > 160) throw new Error('RATE');
        const m = parseSignal(data.toString());
        if (ids.has(m.id)) throw new Error('REPLAY');
        if (m.type === 'join-code' && client !== null && !allow(`code:${client}`, 10))
          throw new Error('RATE');
        ids.add(m.id);
        registry.handle(c, m);
        if (registry.members.has(c)) clearTimeout(auth);
      } catch {
        c.send({ type: 'error' });
        registry.disconnect(c);
        c.close();
      }
    });
    ws.on('error', () => ws.terminate());
    ws.on('close', () => {
      if (client !== null) {
        const count = (sockets.get(client) ?? 1) - 1;
        if (count > 0) sockets.set(client, count);
        else sockets.delete(client);
      }
      clearTimeout(auth);
      clearInterval(heartbeat);
      registry.detach(c);
    });
  });
  const sweep = setInterval(() => {
    registry.sweep();
    const now = Date.now();
    for (const [key, times] of recent) if (!times.some((t) => t > now - 60000)) recent.delete(key);
  }, 1000);
  return {
    server,
    registry,
    close: async () => {
      clearInterval(sweep);
      registry.close();
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = createSignaling();
  app.server.listen(Number(process.env.PORT ?? 3001), '0.0.0.0');
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, () => {
      void app.close().then(() => process.exit(0));
    });
}
