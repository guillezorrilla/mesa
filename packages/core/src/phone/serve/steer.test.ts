import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { profilePaths } from '../../profile/paths.js';
import { listReceipts } from '../../receipts/store.js';
import {
  fixedClock,
  livePhoneSession,
  servingPhone,
  tempDir,
  testStore,
  untilTrue,
} from '../../testing/index.js';
import { deliverQueued } from './deliver.js';
import { phoneQueue } from './queue.js';

const STRICT = 'name: lantern-cove\nguardrail: strict\n';
const receipts = (home: string) =>
  listReceipts(join(home, 'vault'), 20, { kind: 'guardrail' }).map((r) => r.receipt);

test('a reply is typed as a person, its receipt names the phone, and the guardrail stops a block', async () => {
  const at = await servingPhone();
  const { id, window } = await livePhoneSession(at);
  expect(await at.calls.call({ method: 'send', id, text: 'run the tests' })).toEqual({
    status: 'sent',
  });
  expect(window.typed).toEqual(['run the tests']);
  expect(receipts(at.home)[0]).toMatchObject({
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
  const at = await servingPhone(STRICT);
  const { id, window } = await livePhoneSession(at);
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
  const at = await servingPhone();
  const { id, window, hook } = await livePhoneSession(at);
  hook('UserPromptSubmit');
  expect(await at.calls.call({ method: 'send', id, text: 'then the docs' })).toEqual({
    status: 'queued',
  });
  const [held] = (await at.calls.call({ method: 'session', id })).queued;
  expect(held).toMatchObject({ text: 'then the docs' });
  await at.calls.call({ method: 'unqueue', id, message: held?.id ?? '' });
  expect((await at.calls.call({ method: 'session', id })).queued).toEqual([]);

  await at.calls.call({ method: 'send', id, text: 'and the changelog' });
  expect(window.typed).toEqual([]);
  hook('Stop');
  expect(await untilTrue(() => window.typed.length > 0)).toBe(true);
  expect(window.typed).toEqual(['and the changelog']);
  const file = join(profilePaths(at.home, 'default').root, 'phone-queue.json');
  expect(await untilTrue(() => !existsSync(file))).toBe(true);
  await at.end();
});

test("a stopped reply to a working session goes through mesa send's guardrail, which keeps its receipt", async () => {
  const at = await servingPhone(STRICT);
  const { id, window, hook } = await livePhoneSession(at);
  hook('UserPromptSubmit');
  expect(await at.calls.call({ method: 'send', id, text: 'run rm -rf /' })).toMatchObject({
    status: 'blocked',
  });
  expect(await at.calls.call({ method: 'send', id, text: 'tidy the docs' })).toMatchObject({
    status: 'ask',
  });
  expect(receipts(at.home).map((r) => [r.status, r.inputs.via])).toEqual([
    ['blocked', 'phone'],
    ['blocked', 'phone'],
  ]);
  // Send anyway queues it, and its delivery keeps the person's yes.
  expect(await at.calls.call({ method: 'send', id, text: 'tidy the docs', yes: true })).toEqual({
    status: 'queued',
  });
  hook('Stop');
  expect(await untilTrue(() => window.typed.length > 0)).toBe(true);
  expect(window.typed).toEqual(['tidy the docs']);
  expect(receipts(at.home)[0]).toMatchObject({ status: 'ok', outputs: { override: 'yes' } });
  await at.end();
});

test('session actions and saved prompts go through core', async () => {
  const at = await servingPhone();
  const { id, window } = await livePhoneSession(at, { goal: 'Tidy the docs' });
  at.mesa.prompts.save('tests', 'run the tests and summarise the failures');
  expect(await at.calls.call({ method: 'prompts' })).toEqual({
    prompts: [{ name: 'tests', text: 'run the tests and summarise the failures' }],
  });
  await at.calls.call({ method: 'act', id, action: 'rename', text: 'Docs pass' });
  expect((await at.calls.call({ method: 'session', id })).row.title).toBe('Docs pass');

  const forked = await at.calls.call({ method: 'act', id, action: 'fork' });
  expect(testStore(at.home).get(forked.session ?? '').parent).toBe(id);

  window.dead = true;
  await at.calls.call({ method: 'act', id, action: 'stop' });
  expect(testStore(at.home).get(id).endedAt).toBeDefined();
  const resumed = (await at.calls.call({ method: 'act', id, action: 'resume' })).session ?? '';
  expect(testStore(at.home).get(resumed).endedAt).toBeUndefined();

  const handed = await at.calls.call({
    method: 'act',
    id: resumed,
    action: 'handoff',
    text: 'Done: the README. Left: the changelog.',
  });
  expect(testStore(at.home).get(handed.session ?? '').goal).toMatch(
    /^Tidy the docs\n\nRead the handoff note at .+ first\.$/,
  );
  expect(testStore(at.home).get(resumed).endedAt).toBeDefined();

  await at.calls.call({ method: 'act', id, action: 'archive' });
  const archived = await at.calls.call({ method: 'session', id });
  expect(archived.archived).toBe(true);
  await at.calls.call({ method: 'act', id, action: 'unarchive' });
  expect((await at.calls.call({ method: 'session', id })).archived).toBe(false);
  await at.end();
});

test('a photo is kept on the Mac and sent as the image prompt, with a note or alone', async () => {
  const at = await servingPhone();
  const { id, window } = await livePhoneSession(at);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]).toString('base64');
  await at.calls.call({ method: 'send', id, text: 'this button', image: jpeg });
  await at.calls.call({ method: 'send', id, text: '', image: jpeg });
  const prompt = /Read this image as visual input: ".+phone-images\/[0-9a-f]{16}\.jpg"$/;
  expect(window.typed[0]).toMatch(/^this button\n\n/);
  expect(window.typed[0]).toMatch(prompt);
  expect(window.typed[1]).toMatch(new RegExp(`^${prompt.source}`));
  await at.end();
});

test('a queued reply that fails holds its session, and one whose session left the board fails', async () => {
  const queue = phoneQueue({
    file: join(tempDir(), 'phone-queue.json'),
    lock: { processId: 1, processAlive: () => false, clock: fixedClock() },
    clock: fixedClock(),
    newId: (() => {
      let n = 0;
      return () => `m${++n}`;
    })(),
  });
  queue.add('a1', 'first', false);
  queue.add('a1', 'second', true);
  queue.add('b2', 'elsewhere', false);
  const sent: string[] = [];
  const send = async (_id: string, text: string, yes: boolean) => {
    if (text === 'first') throw new Error('the guardrail asks first');
    sent.push(`${text}:${yes}`);
  };
  const rows = [{ id: 'a1', state: 'idle' }] as never;
  await deliverQueued(queue, rows, send);
  await deliverQueued(queue, rows, send);
  expect(sent).toEqual([]);
  expect(queue.of('a1').map((m) => [m.text, m.error])).toEqual([
    ['first', 'the guardrail asks first'],
    ['second', undefined],
  ]);
  expect(queue.of('b2')[0]?.error).toBe('the session is no longer on the board');

  queue.remove('m1');
  await deliverQueued(queue, rows, send);
  expect(sent).toEqual(['second:true']);
});

test('the Mac lists and removes a queued reply, and a watching phone hears of it in an update', async () => {
  const at = await servingPhone();
  const { id, hook } = await livePhoneSession(at);
  hook('UserPromptSubmit');
  await at.calls.call({ method: 'send', id, text: 'then the docs' });
  const { rows } = await at.calls.call({ method: 'sessions' });
  expect(rows.find((row) => row.id === id)?.queued).toBe(1);

  const [held] = at.mesa.phone.queue.list(id);
  expect(held).toMatchObject({ session: id, text: 'then the docs', from: 'phone' });
  expect(at.mesa.phone.queue.list('nope')).toEqual([]);
  at.pushed.length = 0;
  expect(at.mesa.phone.queue.remove(held?.id ?? '')).toEqual({ id: held?.id, removed: true });
  const heard = () =>
    at.pushed.some((m) => m.kind === 'update' && m.rows.some((r) => r.id === id && !r.queued));
  expect(await untilTrue(heard)).toBe(true);
  expect((await at.calls.call({ method: 'session', id })).queued).toEqual([]);
  expect(() => at.mesa.phone.queue.remove(held?.id ?? '')).toThrow('is no longer queued');
  await at.end();
});
