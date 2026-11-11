import https from 'node:https';
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { WebSocket } from 'ws';
const host = process.env.APP_HOST;
if (!host) throw new Error('Set APP_HOST to the deployed HTTPS host or IP');
const origin = `https://${host}`;
const ca = process.env.CA_FILE ? readFileSync(process.env.CA_FILE) : undefined;
const address = process.env.SERVER_IP || host;
const options = {
  ca,
  rejectUnauthorized: true,
  ...(process.env.SERVER_IP
    ? {
        lookup: (_host, options, callback) => {
          const family = isIP(address);
          if (!family) {
            callback(new Error('SERVER_IP must be an IP address'));
            return;
          }
          if (options.all) callback(null, [{ address, family }]);
          else callback(null, address, family);
        },
      }
    : {}),
};
async function request(path) {
  return new Promise((resolve, reject) => {
    const req = https.get(`${origin}${path}`, options, (res) => {
      res.resume();
      resolve({ status: res.statusCode, type: res.headers['content-type'] });
    });
    req.setTimeout(10000, () => req.destroy(new Error('HTTPS timeout')));
    req.on('error', reject);
  });
}
const sockets = [];
async function connect() {
  const ws = new WebSocket(`wss://${host}/ws`, { ...options, origin, handshakeTimeout: 10000 });
  sockets.push(ws);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return ws;
}
const next = (ws) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Signaling response timeout')), 10000);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
const send = (ws, type, data = {}) =>
  ws.send(JSON.stringify({ v: 1, id: crypto.randomUUID(), generation: 0, type, ...data }));
try {
  const paths = {};
  for (const path of ['/phone', '/api/health', '/api/missing', '/assets/missing.js'])
    paths[path] = await request(path);
  if (
    paths['/phone'].status !== 200 ||
    paths['/api/health'].status !== 200 ||
    paths['/api/missing'].status !== 404 ||
    paths['/assets/missing.js'].status !== 404
  )
    throw new Error('Unexpected route status');
  const owner = await connect();
  let response = next(owner);
  send(owner, 'create', { name: 'Deployment check' });
  const room = await response;
  const phone = await connect();
  const waiting = next(phone);
  response = next(owner);
  if (!/^[A-Z2-9]{6}$/.test(room.code)) throw new Error('Missing manual invitation code');
  send(phone, 'join-code', { code: room.code, name: 'Verification phone' });
  const attempt = await response;
  await waiting;
  const approved = next(phone);
  response = next(owner);
  send(owner, 'approve', { attempt: attempt.attempt });
  const phoneApproval = await approved;
  if (phoneApproval.type !== 'approved' || (await response).type !== 'approved')
    throw new Error('Approval failed');
  response = next(owner);
  phone.close();
  if ((await response).type !== 'reconnecting') throw new Error('Missing recovery window');
  const resumed = await connect();
  const resumedApproval = next(resumed);
  response = next(owner);
  send(resumed, 'resume', { room: room.room, resume: phoneApproval.resume });
  if ((await resumedApproval).type !== 'approved' || (await response).type !== 'approved')
    throw new Error('Resume failed');
  send(owner, 'leave');
  console.log(
    JSON.stringify(
      {
        paths,
        wss: 'manual code approved; disconnected phone resumed',
        tls: 'CA and hostname verified; no trust-store changes',
      },
      null,
      2,
    ),
  );
} finally {
  sockets.forEach((ws) => ws.close());
}
