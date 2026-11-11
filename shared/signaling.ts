export type Signal = {
  v: 1;
  id: string;
  type: string;
  generation: number;
  room?: string;
  code?: string;
  resume?: string;
  secret?: string;
  attempt?: string;
  name?: string;
  sdp?: string;
  candidate?: RTCIceCandidateInit | null;
};
export type ServerEvent = {
  code?: string;
  resume?: string;
  type: string;
  room?: string;
  owner?: string;
  invite?: string;
  expires?: number;
  attempt?: string;
  name?: string;
  generation?: number;
  sdp?: string;
  candidate?: RTCIceCandidateInit | null;
  iceServers?: RTCIceServer[];
  policy?: RTCIceTransportPolicy;
};
export function parseSignal(raw: string): Signal {
  if (raw.length > 65536) throw new Error('SIZE');
  const m = JSON.parse(raw) as Signal;
  if (
    !m ||
    typeof m !== 'object' ||
    Array.isArray(m) ||
    m.v !== 1 ||
    typeof m.id !== 'string' ||
    !/^[\w-]{1,64}$/.test(m.id) ||
    !Number.isSafeInteger(m.generation) ||
    m.generation < 0 ||
    m.generation > 1000
  )
    throw new Error('PROTOCOL');
  const fields: Record<string, string[]> = {
    create: ['name'],
    join: ['room', 'secret', 'name'],
    'join-code': ['code', 'name'],
    resume: ['room', 'resume'],
    approve: ['attempt'],
    reject: ['attempt'],
    offer: ['sdp'],
    answer: ['sdp'],
    ice: ['candidate'],
    leave: [],
    heartbeat: [],
    restart: [],
  };
  if (!Object.hasOwn(fields, m.type)) throw new Error('PROTOCOL');
  if (Object.keys(m).some((k) => !['v', 'id', 'type', 'generation', ...fields[m.type]].includes(k)))
    throw new Error('FIELDS');
  for (const key of fields[m.type]) {
    const value = m[key as keyof Signal];
    if (key === 'candidate') {
      if (
        value !== null &&
        (typeof value !== 'object' ||
          Array.isArray(value) ||
          typeof (value as RTCIceCandidateInit).candidate !== 'string' ||
          JSON.stringify(value).length > 4096)
      )
        throw new Error('ICE');
    } else if (
      typeof value !== 'string' ||
      value.length < 1 ||
      value.length > (key === 'sdp' ? 48000 : key === 'name' ? 60 : 128)
    )
      throw new Error('FIELDS');
  }
  if (m.type === 'join-code' && !/^[A-Z2-9]{6}$/.test(m.code!)) throw new Error('CODE');
  return m;
}
