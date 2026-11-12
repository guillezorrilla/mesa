import { expect, test } from 'vitest';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { profilePaths } from '../../profile/paths.js';
import { listReceipts } from '../../receipts/store.js';
import {
  CLAUDE_VERSION,
  fakePairingBroker,
  fakeTmux,
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

/**
 * A paired profile with one session, its listener running, and the phone's end of the mailbox;
 * `world` is the tmux a live session opens in, and `mesaYaml` the project's.
 */
async function serving(mesaYaml?: string) {
  const broker = fakePairingBroker('https://broker.test', () => NOW);
  const world = fakeTmux();
  const runner = scriptedRunner({
    '/usr/bin/id': '501\n',
    tmux: world.answer,
    claude: CLAUDE_VERSION,
  });
  const { mesa, home } = projectProfile(runner.run, {
    ...(mesaYaml === undefined ? {} : { mesaYaml }),
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
  return { mesa, home, world, session, calls, pushed, end };
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

/** A live session opened in the fake tmux, and a way to log its agent's hook events. */
async function live(at: Awaited<ReturnType<typeof serving>>) {
  const { result: opened } = await at.mesa.sessions.open('lantern-cove');
  const window = at.world.windows.find((w) => w.env.MESA_SESSION_ID === opened.id);
  if (!window) throw new Error('no window opened');
  const events = profilePaths(at.home, 'default').events;
  const hook = (event: string) => {
    mkdirSync(events, { recursive: true });
    const line = { at: NOW.toISOString(), agent: 'claude', event, mesaSessionId: opened.id };
    appendFileSync(
      join(events, `${opened.id}.jsonl`),
      `${JSON.stringify({ ...line, payload: { hook_event_name: event } })}\n`,
    );
  };
  hook('Stop');
  return { id: opened.id, window, hook };
}

test('a reply is typed as a person, its receipt names the phone, and the guardrail stops a block', async () => {
  const at = await serving();
  const { id, window } = await live(at);
  expect(await at.calls.call({ method: 'send', id, text: 'run the tests' })).toEqual({
    status: 'sent',
  });
  expect(window.typed).toEqual(['run the tests']);
  const [sent] = listReceipts(join(at.home, 'vault'), 10, { kind: 'guardrail' });
  expect(sent?.receipt).toMatchObject({
    status: 'ok',
    inputs: { session: id, via: 'phone', noFrom: true },
    outputs: { via: 'phone' },
  });

  expect(await at.calls.call({ method: 'send', id, text: 'run rm -rf /', yes: true })).toEqual({
    status: 'blocked',
    reason: expect.stringContaining('destructive'),
  });
  expect(window.typed).toEqual(['run the tests']);
  await at.end();
});

test('a strict project asks first, and Send anyway sends', async () => {
  const at = await serving('name: lantern-cove\nguardrail: strict\n');
  const { id, window } = await live(at);
  expect(await at.calls.call({ method: 'send', id, text: 'tidy the docs' })).toEqual({
    status: 'ask',
    reason: 'project lantern-cove has guardrail: strict',
  });
  expect(window.typed).toEqual([]);
  expect(await at.calls.call({ method: 'send', id, text: 'tidy the docs', yes: true })).toEqual({
    status: 'sent',
  });
  expect(window.typed).toEqual(['tidy the docs']);
  await at.end();
});

test('a reply to a working session is queued, can be taken back, and lands when its turn ends', async () => {
  const at = await serving();
  const { id, window, hook } = await live(at);
  hook('UserPromptSubmit');
  expect(await at.calls.call({ method: 'send', id, text: 'then the docs' })).toEqual({
    status: 'queued',
  });
  expect(await at.calls.call({ method: 'send', id, text: 'run rm -rf /' })).toMatchObject({
    status: 'blocked',
  });
  const [held] = (await at.calls.call({ method: 'session', id })).queued;
  expect(held).toMatchObject({ text: 'then the docs' });
  await at.calls.call({ method: 'unqueue', id, message: held?.id ?? '' });
  expect((await at.calls.call({ method: 'session', id })).queued).toEqual([]);

  await at.calls.call({ method: 'send', id, text: 'and the changelog' });
  expect(window.typed).toEqual([]);
  hook('Stop');
  await until(() => window.typed.length > 0);
  expect(window.typed).toEqual(['and the changelog']);
  await until(() => !existsSync(join(profilePaths(at.home, 'default').root, 'phone-queue.json')));
  await at.end();
});

test('session actions and saved prompts go through core', async () => {
  const at = await serving();
  const { id, window } = await live(at);
  at.mesa.prompts.save('tests', 'run the tests and summarise the failures');
  expect(await at.calls.call({ method: 'prompts' })).toEqual({
    prompts: [{ name: 'tests', text: 'run the tests and summarise the failures' }],
  });
  await at.calls.call({ method: 'act', id, action: 'rename', text: 'Docs pass' });
  expect((await at.calls.call({ method: 'session', id })).row.title).toBe('Docs pass');
  window.dead = true;
  await at.calls.call({ method: 'act', id, action: 'stop' });
  expect(testStore(at.home).get(id).endedAt).toBeDefined();
  await at.calls.call({ method: 'act', id, action: 'archive' });
  expect(testStore(at.home).get(id).archivedAt).toBeDefined();
  await at.calls.call({ method: 'act', id, action: 'unarchive' });
  expect(testStore(at.home).get(id).archivedAt).toBeUndefined();
  await at.end();
});

test('a photo is kept on the Mac and sent as the image prompt', async () => {
  const at = await serving();
  const { id, window } = await live(at);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]).toString('base64');
  await at.calls.call({ method: 'send', id, text: 'this button', image: jpeg });
  expect(window.typed[0]).toMatch(
    /^this button\n\nRead this image as visual input: ".+phone-images\/[0-9a-f]{16}\.jpg"$/,
  );
  await at.end();
});

test('a reply is cut into prose and its fenced code blocks', () => {
  expect(replySegments('Run this:\n\n```sh\npnpm test\n```\nThen push.')).toEqual([
    { code: false, text: 'Run this:' },
    { code: true, text: 'pnpm test' },
    { code: false, text: 'Then push.' },
  ]);
  expect(replySegments('```ts\nconst a = 1;')).toEqual([{ code: true, text: 'const a = 1;' }]);
});
