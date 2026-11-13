import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { listReceipts } from '../../receipts/store.js';
import { gateAdvice, gateRequest } from '../../tasks/gate-advice.js';
import {
  claudePromptPane,
  listenerRecord,
  newSession,
  plantHookEvent,
  servingPhone,
  testStore,
  untilTrue,
} from '../../testing/index.js';
import type { UsageReport } from '../../usage/records.js';
import { phoneReplies, replySegments } from './replies.js';
import { askLine } from './rows.js';
import { phoneUsage } from './usage.js';

test('the listener answers the board, a session and a mark through core, one per profile', async () => {
  const { mesa, home, session, calls, end } = await servingPhone();
  const { rows } = await calls.call({ method: 'sessions' });
  // It says which Mesa it runs, so a look after an update restarts an older one (#1133).
  expect(JSON.parse(readFileSync(listenerRecord(home), 'utf8'))).toEqual({
    pid: 4242,
    version: '0.1.0-beta.4',
  });
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
  const { mesa, session, calls, pushed, end } = await servingPhone();
  await calls.call({ method: 'sessions' });
  mesa.sessions.rename(session.id, 'Login fix, round 2');
  expect(await untilTrue(() => pushed.some((m) => m.kind === 'update'))).toBe(true);
  expect(pushed.find((m) => m.kind === 'update')).toMatchObject({
    rows: [{ id: session.id, title: 'Login fix, round 2' }],
    gone: [],
  });
  await end();
});

test('the phone reads a waiting prompt, sees it on its row, answers it as the person, and is told when it went stale', async () => {
  const { mesa, home, world, calls, end } = await servingPhone();
  const { result: opened } = await mesa.sessions.open('lantern-cove', { agent: 'claude' });
  const { id } = opened;
  const window = world.windows[0];
  if (!window) throw new Error('no window opened');
  const payload = { tool_name: 'Bash', tool_input: { command: 'touch beacon.txt' } };
  const hook = (at: string) =>
    plantHookEvent(home, { session: id, agent: 'claude', at, event: 'PermissionRequest', payload });
  hook('2026-09-24T11:59:00.000Z');
  window.screen = claudePromptPane('bash');

  const prompt = await calls.call({ method: 'prompt', id });
  expect(prompt).toMatchObject({
    status: 'pending',
    kind: 'permission',
    tool: 'Bash',
    summary: 'touch beacon.txt',
    options: [
      { id: 'allow', label: 'Allow' },
      { id: 'deny', label: 'Deny' },
    ],
    freeText: false,
  });
  if (prompt.status !== 'pending') throw new Error('not pending');
  const { rows } = await calls.call({ method: 'sessions' });
  expect(rows.find((row) => row.id === id)?.ask).toBe('Bash: touch beacon.txt');

  // Answered at the Mac first: the next prompt, asking the same, has a new id.
  hook('2026-09-24T11:59:30.000Z');
  const stale = { method: 'answer', id, prompt: prompt.id, option: 'allow' } as const;
  expect(await calls.call(stale)).toEqual({ status: 'stale' });
  expect(window.keys).toEqual([]);

  const now = await calls.call({ method: 'prompt', id });
  if (now.status !== 'pending') throw new Error('not pending');
  expect(await calls.call({ ...stale, prompt: now.id })).toEqual({ status: 'answered' });
  expect(window.keys).toEqual(['1']);
  const answer = listReceipts(join(home, 'vault')).find((r) => r.receipt.kind === 'answer');
  expect(answer?.receipt.inputs).toMatchObject({ session: id, via: 'phone', option: 'allow' });
  await expect(calls.call({ method: 'answer', id, prompt: now.id })).rejects.toThrow(
    'pass an option or --text',
  );
  await end();
});

test("a row's ask is the prompt in one line: the tool, the first line, clipped", () => {
  const pending = {
    status: 'pending' as const,
    session: 's',
    id: 'p',
    options: [],
    freeText: false,
  };
  expect(askLine({ ...pending, kind: 'permission', tool: 'Bash', summary: 'ls\npwd' })).toBe(
    'Bash: ls',
  );
  expect(
    askLine({ ...pending, kind: 'question', tool: 'AskUserQuestion', summary: 'Which?' }),
  ).toBe('Which?');
  expect(askLine({ ...pending, kind: 'question', summary: 'x'.repeat(200) })).toHaveLength(120);
  expect(askLine({ status: 'unsupported', session: 's', reason: 'no' })).toBeUndefined();
});

test('a reply is cut into prose and its fenced code blocks', () => {
  expect(replySegments('Run this:\n\n```sh\npnpm test\n```\nThen push.')).toEqual([
    { code: false, text: 'Run this:' },
    { code: true, text: 'pnpm test' },
    { code: false, text: 'Then push.' },
  ]);
  expect(replySegments('```ts\nconst a = 1;')).toEqual([{ code: true, text: 'const a = 1;' }]);
});

test("the session screen's conversation places the person's prompts among the agent's replies", () => {
  const reply = (revision: string, text: string) => ({
    revision,
    text,
    at: '2026-11-12T10:00:00Z',
  });
  const read = {
    // Newest first: the agent answered the second prompt with r2, the first with r1.
    rows: [reply('r2', 'Done.\n```sh\npnpm test\n```'), reply('r1', 'Looking.')],
    prompts: [
      { revision: 'p3', text: 'And the docs?', newer: 0 },
      { revision: 'p2', text: 'Run the tests', newer: 1 },
      { revision: 'p1', text: 'Fix the login', newer: 2 },
    ],
  };
  const ids = (count: number, withPrompts: boolean) =>
    phoneReplies(read, count, withPrompts).replies.map((r) => `${r.from}:${r.id}`);
  expect(ids(2, true)).toEqual(['you:p3', 'agent:r2', 'you:p2', 'agent:r1', 'you:p1']);
  expect(ids(1, true)).toEqual(['you:p3', 'agent:r2', 'you:p2']);
  // An older phone names no count: the agent's replies alone, as before.
  expect(ids(5, false)).toEqual(['agent:r2', 'agent:r1']);
  expect(phoneReplies(read, 1, true).more).toBe(true);
  expect(phoneReplies(read, 2, true).more).toBe(false);
  expect(phoneReplies(read, 2, true).replies[0]).toEqual({
    id: 'p3',
    at: null,
    segments: [{ code: false, text: 'And the docs?' }],
    from: 'you',
  });
  expect(phoneReplies(read, 2, true).replies[1]?.segments).toHaveLength(2);
});

test("a coordinator's crew, its task graph and its gates answer the phone, and a gate resolves", async () => {
  const { mesa, store, session, calls, end } = await servingPhone();
  const worker = store.create(() => newSession({ parent: session.id, name: 'Tide parser' }));
  const parse = mesa.tasks.create('Parse the tide tables', { coordinator: session.id });
  const chart = mesa.tasks.create('Chart the tides', { coordinator: session.id, deps: [parse.id] });
  const gate = mesa.gates.create(parse.id, 'Metres or feet?', ['metres', 'feet']);

  const crew = await calls.call({ method: 'crew', id: session.id });
  expect(crew.workers).toMatchObject([{ id: worker.id, title: 'Tide parser', branch: null }]);
  expect(crew.tasks).toEqual([
    { id: parse.id, title: 'Parse the tide tables', state: 'blocked', deps: [], gate: gate.id },
    { id: chart.id, title: 'Chart the tides', state: 'pending', deps: [parse.id] },
  ]);

  const { gates } = await calls.call({ method: 'gates' });
  expect(gates).toEqual([
    {
      id: gate.id,
      question: 'Metres or feet?',
      options: ['metres', 'feet'],
      task: 'Parse the tide tables',
      coordinator: session.id,
    },
  ]);
  // No Decision model in this profile: the advice says why, and the options still show.
  const advised = await calls.call({ method: 'gate', id: gate.id });
  expect(advised.advice).toMatchObject({ status: 'unavailable', odds: [] });
  expect(advised.advice.reason).toContain('no decision model');

  await calls.call({ method: 'resolve', id: gate.id, option: 'feet' });
  expect((await calls.call({ method: 'gates' })).gates).toEqual([]);
  await expect(calls.call({ method: 'gate', id: gate.id })).rejects.toThrow(
    `no open gate ${gate.id}`,
  );
  await expect(calls.call({ method: 'merge', id: session.id })).rejects.toThrow('no parent');
  await end();
});

test("a gate's options go to the Decision model as next-step slugs and its odds come back by option", () => {
  const gate = { question: 'Metres or feet?', options: ['metres', 'feet'], task: 'Parse' };
  expect(gateRequest(gate).candidates).toEqual([
    { id: 'option-1', step: 'metres' },
    { id: 'option-2', step: 'feet' },
  ]);
  expect(
    gateAdvice(gate, {
      site: 'next-step',
      mode: 'on-demand',
      status: 'accepted',
      answer: 'option-2',
      probabilities: { 'option-1': 0.2, 'option-2': 0.7, defer: 0.1 },
      model: 'clef-test',
      latencyMs: 900,
    }),
  ).toEqual({
    status: 'accepted',
    pick: 'feet',
    odds: [
      { option: 'metres', p: 0.2 },
      { option: 'feet', p: 0.7 },
    ],
    defer: 0.1,
    model: 'clef-test',
  });
});

test('the Inbox, usage and push settings answer the phone through core', async () => {
  const { mesa, home, session, calls, end } = await servingPhone();
  expect(await calls.call({ method: 'pushes' })).toEqual({
    push: 'away',
    awayAfter: 5,
    finished: true,
  });

  // A question raises an Inbox notice that names its session; the phone marks it read.
  const at = '2026-09-24T11:59:00.000Z';
  plantHookEvent(home, {
    session: session.id,
    agent: 'claude',
    at,
    event: 'PermissionRequest',
    payload: { tool_name: 'Bash' },
  });
  const { notices } = await calls.call({ method: 'inbox' });
  expect(notices).toEqual([
    {
      id: expect.any(String),
      kind: 'input-required',
      at,
      title: 'Session needs permission',
      read: false,
      session: { id: session.id, title: 'Login fix' },
    },
  ]);
  await calls.call({ method: 'noticeRead', id: notices[0]?.id ?? '' });
  expect((await calls.call({ method: 'inbox' })).notices[0]?.read).toBe(true);
  expect(mesa.notifications.list()[0]?.read).toBe(true);
  await expect(calls.call({ method: 'noticeRead', id: 'nope' })).rejects.toThrow('no inbox item');

  // No readings yet: nothing spent, the session listed with its context.
  const usage = await calls.call({ method: 'usage' });
  expect(usage).toMatchObject({ today: 0, week: 0, month: 0, alerts: [] });
  expect(usage.days).toHaveLength(14);
  expect(usage.sessions).toEqual([
    { id: session.id, title: 'Login fix', project: 'lantern-cove', cost: null, context: null },
  ]);
  // Ended, it leaves the Agents tab as it leaves the sidebar, and Usage still counts it.
  testStore(home).update(session.id, { endedAt: '2026-09-24T12:30:00.000Z' });
  // The listener looks again once its file watch hears the record change.
  const listed = async () => (await calls.call({ method: 'sessions' })).rows.length === 0;
  expect(await untilTrue(listed)).toBe(true);
  expect((await calls.call({ method: 'usage' })).sessions.map((s) => s.id)).toEqual([session.id]);

  expect(await calls.call({ method: 'pushes', set: { push: 'always', finished: false } })).toEqual({
    push: 'always',
    awayAfter: 5,
    finished: false,
  });
  expect(mesa.config.get().phone).toMatchObject({ push: 'always', finished: false });
  await end();
});

test("the phone's usage sums each session's cost, unknown when one reading has no price", () => {
  const totals = (estimatedCostUsd: number | null) => ({
    events: 1,
    input: 1,
    output: 1,
    cacheRead: 0,
    cacheWrite: 0,
    estimatedCostUsd,
  });
  const reading = (session: string, cost: number | null) =>
    ({ session, estimatedCostUsd: cost }) as UsageReport['rows'][number];
  const row = (id: string, context: number | null) => ({
    id,
    title: id,
    project: null,
    state: 'idle',
    since: '',
    context,
    unread: false,
  });
  const report = {
    rows: [reading('a', 1.5), reading('a', 0.25), reading('b', 0.5), reading('b', null)],
    unknown: [{ session: 'c', reason: 'native session id is not available' }],
    periods: {
      today: totals(2),
      '7d': totals(3),
      '30d': totals(4),
      '90d': totals(4),
      month: totals(4),
    },
    alerts: [{ period: 'today' as const, thresholdUsd: 1, knownCostUsd: 2 }],
    daily: Array.from({ length: 90 }, (_, i) => ({ day: `d${i}`, totals: totals(i), models: [] })),
    breakdown: [],
    agents: [],
  } satisfies UsageReport;
  const usage = phoneUsage(report, [row('b', 10), row('c', null), row('a', 42), row('d', 3)]);
  expect(usage).toMatchObject({ today: 2, week: 3, month: 4 });
  expect(usage.days[0]).toEqual({ day: 'd76', cost: 76 });
  expect(usage.days).toHaveLength(14);
  expect(usage.sessions.map((s) => [s.id, s.cost, s.context])).toEqual([
    ['a', 1.75, 42],
    ['d', 0, 3],
    ['b', null, 10],
    ['c', null, null],
  ]);
  expect(usage.alerts).toEqual([
    'Known estimated today cost reached your $1.00 alert. Agents keep running.',
  ]);
});
