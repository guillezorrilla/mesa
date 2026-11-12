import { expect, test } from 'vitest';
import {
  fakePairingBroker,
  fakePhone,
  memorySecretStore,
  newSession,
  plantOutputLog,
  projectProfile,
  scriptedRunner,
  testStore,
} from '../../testing/index.js';
import type { PhoneMessage } from '../protocol/envelope.js';
import { phoneKeys } from '../protocol/join.js';
import { mailbox } from '../protocol/mailbox.js';
import { macCalls } from '../protocol/requests.js';
import { replySegments } from './replies.js';

const NOW = new Date('2026-09-24T12:00:00.000Z');

/** A paired profile with one session, its listener running, and the phone's end of the mailbox. */
async function serving() {
  const broker = fakePairingBroker('https://broker.test', () => NOW);
  const { mesa, home } = projectProfile(scriptedRunner({ '/usr/bin/id': '501\n' }).run, {
    http: broker.http,
    connect: broker.connect,
    secretStore: memorySecretStore().store,
    env: { MESA_BROKER_URL: 'https://broker.test' },
  });
  const phone = fakePhone(broker.http, () => NOW);
  await phone.join((await mesa.phone.pair()).result.qr);
  await mesa.phone.status();
  const session = testStore(home).create(() =>
    newSession({ goal: 'Fix the login page\nwith tests', name: 'Login fix' }),
  );
  plantOutputLog(home, session.id, 'npm test\n12 passing\n');

  const stop = new AbortController();
  const listener = mesa.phone.serve(stop.signal);
  const p = phone.pairing;
  if (!p) throw new Error('not joined');
  const pushed: PhoneMessage[] = [];
  let ids = 0;
  const calls = macCalls({
    send: (message) => box.send(message),
    newId: () => `q${++ids}`,
    wait: () => new Promise(() => {}),
  });
  const box = mailbox(
    { connect: broker.connect, now: () => NOW },
    { ...p, token: p.phoneToken, keys: phoneKeys(p) },
    { message: (message) => calls.settle(message) || pushed.push(message) },
  );
  box.connect();
  const end = async () => {
    stop.abort();
    box.close();
    return listener;
  };
  return { mesa, session, calls, pushed, end };
}

const until = async (done: () => boolean) => {
  for (let i = 0; i < 500 && !done(); i++) await new Promise((r) => setImmediate(r));
  expect(done()).toBe(true);
};

test('the listener answers the board, a session and a mark through core, one per profile', async () => {
  const { mesa, session, calls, end } = await serving();
  const { rows } = await calls.call({ method: 'sessions' });
  expect(rows).toEqual([
    {
      id: session.id,
      title: 'Login fix',
      project: 'lantern-cove',
      state: expect.any(String),
      since: expect.any(String),
      context: null,
      unread: expect.any(Boolean),
    },
  ]);

  const detail = await calls.call({ method: 'session', id: session.id });
  expect(detail).toMatchObject({
    goal: 'Fix the login page\nwith tests',
    replies: [],
    tail: ['npm test', '12 passing'],
  });
  await expect(calls.call({ method: 'session', id: 'nope' })).rejects.toThrow('no session nope');

  await calls.call({ method: 'mark', id: session.id, unread: true });
  expect((await calls.call({ method: 'sessions' })).rows[0]?.unread).toBe(true);

  await expect(mesa.phone.serve()).rejects.toThrow('a phone listener already runs');
  expect(await end()).toEqual({ pairingId: 'pairing-0000000001', ended: 'stopped' });
});

test('while the phone watches, a changed row is pushed as an update', async () => {
  const { mesa, session, calls, pushed, end } = await serving();
  await calls.call({ method: 'sessions' });
  mesa.sessions.rename(session.id, 'Login fix, round 2');
  await until(() => pushed.some((m) => m.kind === 'update'));
  expect(pushed.find((m) => m.kind === 'update')).toMatchObject({
    rows: [{ id: session.id, title: 'Login fix, round 2' }],
    gone: [],
  });
  await end();
});

test('a reply is cut into prose and its fenced code blocks', () => {
  expect(replySegments('Run this:\n\n```sh\npnpm test\n```\nThen push.')).toEqual([
    { code: false, text: 'Run this:' },
    { code: true, text: 'pnpm test' },
    { code: false, text: 'Then push.' },
  ]);
  expect(replySegments('```ts\nconst a = 1;')).toEqual([{ code: true, text: 'const a = 1;' }]);
});
