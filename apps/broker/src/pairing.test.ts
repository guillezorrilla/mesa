import {
  hashOf,
  newKeyPair,
  newSecret,
  openMessage,
  sealMessage,
  sideKeys,
} from '@mesa/core/browser';
import { expect, test } from 'vitest';
import { BOX_MAX, KEEP_COUNT, KEEP_MS } from './boxes.js';
import { handle } from './broker.js';
import {
  AUTH_MS,
  JOIN_MS,
  Pairing,
  type PairingObjectState,
  type PairingSocket,
} from './pairing.js';

const BROKER = 'https://broker.example.test';

/** A Durable Object's state in memory: what was stored, and the sockets it accepted. */
function memoryState() {
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
function fakeSocket() {
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

/** A broker with one in-memory Pairing per id and a clock the test moves. */
function broker() {
  const clock = { now: new Date('2026-11-11T10:00:00Z') };
  const objects = new Map<string, { pairing: Pairing; memory: ReturnType<typeof memoryState> }>();
  const objectOf = (id: string) => {
    let object = objects.get(id);
    if (!object) {
      const memory = memoryState();
      object = { pairing: new Pairing(memory.state, undefined, () => clock.now), memory };
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
async function paired() {
  const b = broker();
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

test('a Mac opens a pairing and a phone joins it once with the secret hash and its key', async () => {
  const p = await paired();
  expect(p.created.status).toBe(201);
  expect(p.created.body).toEqual({
    pairingId: expect.stringMatching(/^[\w-]{22}$/),
    macToken: expect.any(String),
    expiresAt: new Date(p.clock.now.getTime() + JOIN_MS).toISOString(),
  });
  expect(p.joined).toEqual({ status: 201, body: { phoneToken: expect.any(String) } });
  const state = await p.call(`/pairings/${p.pairingId}`, { token: p.macToken });
  expect(state.body).toMatchObject({
    joinedAt: '2026-11-11T10:00:00.000Z',
    phoneKey: expect.any(String),
  });
  expect(state.body).not.toHaveProperty('joinHash');
  expect(state.body).not.toHaveProperty('macTokenHash');

  const again = await p.post(`/pairings/${p.pairingId}/join`, {
    joinHash: hashOf(p.secret),
    phoneKey: newKeyPair().publicKey,
  });
  expect(again).toEqual({ status: 409, body: { error: 'used' } });
});

test('a join with the wrong secret is refused, and one after ten minutes finds it expired and gone', async () => {
  const b = broker();
  const { pairingId } = (await b.post('/pairings', { joinHash: hashOf(newSecret()) })).body;
  const phoneKey = newKeyPair().publicKey;
  expect(
    await b.post(`/pairings/${pairingId}/join`, { joinHash: hashOf(newSecret()), phoneKey }),
  ).toEqual({
    status: 403,
    body: { error: 'bad_secret' },
  });
  b.clock.now = new Date(b.clock.now.getTime() + JOIN_MS);
  expect(await b.post(`/pairings/${pairingId}/join`, { joinHash: 'x', phoneKey })).toEqual({
    status: 410,
    body: { error: 'expired' },
  });
  expect(b.objectOf(pairingId).memory.data.size).toBe(0);
});

test('an unknown pairing, a bad id, a bad body and a missing token are refused', async () => {
  const b = broker();
  expect((await b.call('/pairings/AAAAAAAAAAAAAAAAAAAAAA', { token: 't' })).status).toBe(404);
  expect((await b.call('/pairings/short')).status).toBe(404);
  expect((await b.post('/pairings', { joinHash: 7 })).status).toBe(400);
  const p = await paired();
  expect((await p.call(`/pairings/${p.pairingId}`)).status).toBe(401);
  expect((await p.call(`/pairings/${p.pairingId}`, { token: 'not-a-token' })).status).toBe(401);
});

test('a box goes to the other side only, waits until taken, and the broker holds only ciphertext and hashes', async () => {
  const p = await paired();
  const box = sealMessage(p.keys.mac, 1, p.clock.now, {
    kind: 'text',
    text: 'deploy the hotfix',
  });
  expect((await p.post(`/pairings/${p.pairingId}/messages`, { box }, p.macToken)).body).toEqual({
    id: 1,
  });

  expect((await p.call(`/pairings/${p.pairingId}/messages`, { token: p.macToken })).body).toEqual({
    messages: [],
  });
  const waiting = (await p.call(`/pairings/${p.pairingId}/messages`, { token: p.phoneToken })).body
    .messages;
  expect(waiting).toEqual([{ id: 1, box, at: '2026-11-11T10:00:00.000Z' }]);
  expect(openMessage(p.keys.phone, waiting[0].box, 0)).toMatchObject({
    message: { kind: 'text', text: 'deploy the hotfix' },
  });

  const stored = JSON.stringify([...p.objectOf(p.pairingId).memory.data]);
  expect(stored).not.toContain('deploy the hotfix');
  expect(stored).not.toContain(p.macToken);
  expect(stored).not.toContain(p.phoneToken);
  expect(stored).not.toContain(p.secret);

  await p.post(`/pairings/${p.pairingId}/ack`, { upTo: 1 }, p.phoneToken);
  expect((await p.call(`/pairings/${p.pairingId}/messages`, { token: p.phoneToken })).body).toEqual(
    { messages: [] },
  );
});

test('boxes older than seven days, past the count, or too long are not kept', async () => {
  const p = await paired();
  const send = (box: string) => p.post(`/pairings/${p.pairingId}/messages`, { box }, p.macToken);
  await send('old');
  p.clock.now = new Date(p.clock.now.getTime() + KEEP_MS + 1);
  for (let n = 0; n < KEEP_COUNT + 1; n++) await send(`box-${n}`);
  const waiting = (await p.call(`/pairings/${p.pairingId}/messages`, { token: p.phoneToken })).body
    .messages;
  expect(waiting).toHaveLength(KEEP_COUNT);
  expect(waiting[0].box).toBe('box-1');
  expect((await send('x'.repeat(BOX_MAX + 1))).status).toBe(400);
});

test('a connected socket gets waiting boxes after auth and new ones at once; a bad first frame closes it', async () => {
  const p = await paired();
  const object = p.objectOf(p.pairingId);
  await p.post(`/pairings/${p.pairingId}/messages`, { box: 'early' }, p.macToken);

  const phone = fakeSocket();
  object.memory.sockets.push(phone);
  await object.pairing.webSocketMessage(phone, JSON.stringify({ t: 'auth', token: p.phoneToken }));
  expect(phone.sent).toEqual([
    { t: 'ready' },
    { t: 'msg', id: 1, box: 'early', at: expect.any(String) },
  ]);

  await p.post(`/pairings/${p.pairingId}/messages`, { box: 'live' }, p.macToken);
  expect(phone.sent.at(-1)).toMatchObject({ t: 'msg', id: 2, box: 'live' });

  await object.pairing.webSocketMessage(phone, JSON.stringify({ t: 'send', box: 'from-phone' }));
  expect(
    (await p.call(`/pairings/${p.pairingId}/messages`, { token: p.macToken })).body.messages,
  ).toEqual([{ id: 3, box: 'from-phone', at: expect.any(String) }]);

  const stranger = fakeSocket();
  await object.pairing.webSocketMessage(stranger, JSON.stringify({ t: 'send', box: 'x' }));
  expect(stranger.closed).toBe(4001);
});

test('unpairing deletes everything and closes the sockets; an old token then hears 401 until the tombstone lapses', async () => {
  const p = await paired();
  const object = p.objectOf(p.pairingId);
  const phone = fakeSocket();
  object.memory.sockets.push(phone);
  await p.post(`/pairings/${p.pairingId}/messages`, { box: 'b' }, p.macToken);
  expect(
    (await p.call(`/pairings/${p.pairingId}`, { method: 'DELETE', token: p.phoneToken })).status,
  ).toBe(204);
  expect([...object.memory.data.keys()]).toEqual(['gone']);
  expect(phone.closed).toBe(4000);
  expect(await p.call(`/pairings/${p.pairingId}`, { token: p.macToken })).toEqual({
    status: 401,
    body: { error: 'unpaired' },
  });
  expect(object.memory.alarm()).toBe(p.clock.now.getTime() + KEEP_MS);
  p.clock.now = new Date(p.clock.now.getTime() + KEEP_MS);
  await object.pairing.alarm();
  expect(object.memory.data.size).toBe(0);
  expect((await p.call(`/pairings/${p.pairingId}`, { token: p.macToken })).status).toBe(404);
});

test('the alarm forgets a pairing no phone joined in ten minutes, and keeps a joined one', async () => {
  const b = broker();
  const { pairingId } = (await b.post('/pairings', { joinHash: hashOf(newSecret()) })).body;
  const object = b.objectOf(pairingId);
  expect(object.memory.alarm()).toBe(b.clock.now.getTime() + JOIN_MS);
  await object.pairing.alarm();
  expect(object.memory.data.size).toBeGreaterThan(0);
  b.clock.now = new Date(b.clock.now.getTime() + JOIN_MS);
  await object.pairing.alarm();
  expect(object.memory.data.size).toBe(0);

  const p = await paired();
  p.clock.now = new Date(p.clock.now.getTime() + JOIN_MS);
  await p.objectOf(p.pairingId).pairing.alarm();
  expect(p.objectOf(p.pairingId).memory.data.size).toBeGreaterThan(0);
});

test('the alarm drops boxes past seven days that no one came for', async () => {
  const p = await paired();
  const object = p.objectOf(p.pairingId);
  await p.post(`/pairings/${p.pairingId}/messages`, { box: 'unread' }, p.macToken);
  const boxKeys = () => [...object.memory.data.keys()].filter((key) => key.startsWith('box:'));
  expect(boxKeys()).toHaveLength(1);
  p.clock.now = new Date(p.clock.now.getTime() + KEEP_MS + 1);
  await object.pairing.alarm();
  expect(boxKeys()).toEqual([]);
});

test('the alarm closes a socket that never authenticated, and holds the next alarm for it', async () => {
  const p = await paired();
  const object = p.objectOf(p.pairingId);
  const idle = fakeSocket();
  idle.serializeAttachment({ acceptedAt: p.clock.now.getTime() });
  object.memory.sockets.push(idle);
  await object.pairing.alarm();
  expect(idle.closed).toBeUndefined();
  expect(object.memory.alarm()).toBe(p.clock.now.getTime() + AUTH_MS);
  p.clock.now = new Date(p.clock.now.getTime() + AUTH_MS);
  await object.pairing.alarm();
  expect(idle.closed).toBe(4001);
});

test('boxes sent at the same moment each get their own id, and none overwrites another', async () => {
  const p = await paired();
  const send = (box: string, token: string) =>
    p.post(`/pairings/${p.pairingId}/messages`, { box }, token);
  const ids = await Promise.all([
    send('one', p.macToken),
    send('two', p.macToken),
    send('three', p.phoneToken),
    p.call(`/pairings/${p.pairingId}`, { token: p.phoneToken }),
  ]);
  expect(new Set(ids.slice(0, 3).map((answer) => answer.body.id)).size).toBe(3);
  const toPhone = await p.call(`/pairings/${p.pairingId}/messages`, { token: p.phoneToken });
  expect(toPhone.body.messages.map((m: { box: string }) => m.box).sort()).toEqual(['one', 'two']);
});

test('without the Durable Object binding the pairing routes answer not_configured', async () => {
  const answer = await handle(
    new Request(`${BROKER}/pairings`, { method: 'POST', body: '{}' }),
    {},
    fetch,
  );
  expect(answer.status).toBe(500);
  expect(await answer.json()).toEqual({ error: 'not_configured' });
});
