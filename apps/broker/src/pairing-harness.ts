// The pairing tests' broker: in-memory Durable Objects, a clock the test moves, and a joined pair.
import { hashOf, newKeyPair, newSecret, sideKeys } from '@mesa/core/browser';
import type { Pusher } from './apns.js';
import { type Env, handle } from './broker.js';
import { Pairing, type PairingObjectState, type PairingSocket } from './pairing.js';

const BROKER = 'https://broker.example.test';

/** A Durable Object's state in memory: what was stored, and the sockets it accepted. */
export function memoryState() {
  const data = new Map<string, unknown>();
  const sockets: PairingSocket[] = [];
  let alarm: number | null = null;
  const state: PairingObjectState = {
    storage: {
      get: async <T>(key: string) => structuredClone(data.get(key)) as T | undefined,
      put: async (key, value) => void data.set(key, structuredClone(value)),
      delete: async (keys) => keys.filter((key) => data.delete(key)).length,
      list: async <T>({ prefix }: { prefix: string }) =>
        new Map(
          [...data].filter(([key]) => key.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1)),
        ) as Map<string, T>,
      deleteAll: async () => data.clear(),
      getAlarm: async () => alarm,
      setAlarm: async (at) => {
        alarm = at;
      },
    },
    acceptWebSocket: (socket) => void sockets.push(socket),
    getWebSockets: () => sockets,
  };
  return { state, data, sockets, alarm: () => alarm };
}

/** A socket that records what it was sent and how it closed. */
export function fakeSocket() {
  let attachment: unknown = null;
  const sent: Record<string, unknown>[] = [];
  const socket: PairingSocket & { sent: typeof sent; closed?: number } = {
    sent,
    send: (data) => void sent.push(JSON.parse(data)),
    close(code) {
      this.closed = code;
    },
    serializeAttachment: (value) => {
      attachment = value;
    },
    deserializeAttachment: () => attachment,
  };
  return socket;
}

/** A broker with one in-memory Pairing per id and a clock the test moves; `push` sends to APNs. */
export function broker(options: { env?: Env; push?: Pusher } = {}) {
  const clock = { now: new Date('2026-11-11T10:00:00Z') };
  const objects = new Map<string, { pairing: Pairing; memory: ReturnType<typeof memoryState> }>();
  const objectOf = (id: string) => {
    let object = objects.get(id);
    if (!object) {
      const memory = memoryState();
      object = {
        pairing: new Pairing(memory.state, options.env, () => clock.now, options.push),
        memory,
      };
      objects.set(id, object);
    }
    return object;
  };
  const call = async (path: string, init: RequestInit & { token?: string } = {}) => {
    const { token, ...rest } = init;
    const headers = new Headers(rest.headers);
    if (token) headers.set('authorization', `Bearer ${token}`);
    const answer = await handle(
      new Request(`${BROKER}${path}`, { ...rest, headers }),
      {},
      async () => new Response(null, { status: 500 }),
      undefined,
      undefined,
      { stub: (id) => objectOf(id).pairing, limit: async () => true },
    );
    return {
      status: answer.status,
      body: answer.status === 204 ? undefined : await answer.json(),
    };
  };
  const post = (path: string, body: unknown, token?: string) =>
    call(path, { method: 'POST', body: JSON.stringify(body), token });
  return { clock, call, post, objectOf };
}

/** A Mac's pairing and a joined phone, with each side's keys. */
export async function paired(options: Parameters<typeof broker>[0] = {}) {
  const b = broker(options);
  const secret = newSecret();
  const mac = newKeyPair();
  const created = await b.post('/pairings', { joinHash: hashOf(secret) });
  const { pairingId, macToken } = created.body;
  const phone = newKeyPair();
  const joined = await b.post(`/pairings/${pairingId}/join`, {
    joinHash: hashOf(secret),
    phoneKey: phone.publicKey,
  });
  const keys = {
    mac: sideKeys({
      side: 'mac',
      privateKey: mac.privateKey,
      peerPublicKey: phone.publicKey,
      pairingId,
    }),
    phone: sideKeys({
      side: 'phone',
      privateKey: phone.privateKey,
      peerPublicKey: mac.publicKey,
      pairingId,
    }),
  };
  return {
    ...b,
    created,
    joined,
    pairingId,
    macToken,
    phoneToken: joined.body.phoneToken,
    keys,
    secret,
  };
}
