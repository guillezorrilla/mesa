import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { AGENTS } from '../../agents/agents.js';
import { claudeTranscripts } from '../../agents/claude/paths.js';
import type { MesaDeps } from '../../context.js';
import type { Runner } from '../../lib/process.js';
import { createMesa } from '../../mesa.js';
import { listReceipts, sessionReceipt } from '../../receipts/store.js';
import { GENERAL_PROJECT } from '../../sessions/record/general.js';
import type { NewSession } from '../../sessions/record/record.js';
import { windowEnv } from '../../sessions/window/caller.js';
import {
  agentWorld,
  claudeAnswer,
  claudeResult,
  finishesRun,
  newSession,
  plantTranscript,
  projectProfile,
  systemOneWorld,
  TEST_TYPESAFE_KEY,
  testDeps,
  testStore,
} from '../../testing/index.js';
import { readNote } from '../notes.js';
import { captureItems } from './items.js';

// Vault capture (CONTEXT.md): a session's end starts one vault-capture run over its conversation,
// and the run's end lands its decisions and notes, all or none, under one receipt.

const CONVERSATION = [
  {
    type: 'user',
    message: { role: 'user', content: 'Should the tide feed retry on 503? tide-key-0042' },
  },
  {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'Retry three times, 30 s apart: the feed rebuilds hourly.' }],
    },
  },
];
const DECISION = {
  kind: 'decision',
  title: 'Tide feed retries three times',
  decision: 'The feed client retries a 503 three times, 30 s apart.',
  rationale: 'The feed rebuilds its cache on the hour and answers 503 for about 10 s.',
  probabilities: { 'retry-three': 0.82, queue: 0.18 },
  confidence: 0.8,
};
const NOTE = {
  kind: 'note',
  title: 'The tide feed answers 503 on the hour',
  body: 'It rebuilds its cache on the hour; retry after 15 s.',
};
const CAPTURE = "'/vault-capture'";

/** A transcript line of `role` saying `text` at `at`, as Claude Code writes one. */
const said = (role: 'user' | 'assistant', text: string, at: string) =>
  JSON.stringify({ type: role, timestamp: at, message: { role, content: text } });
/** A conversation that goes on: each turn a question and its answer, a minute apart from 09:00. */
const TURNS = [
  ['Which port does the tide feed use?', 'Port 7341, as the harbour proxy expects.'],
  ['Should the tide feed cache on disk?', 'No: it rebuilds hourly, so memory is enough.'],
  ['Who owns the tide feed alerts?', 'The harbour team, paged after 3 failures.'],
].map(([question = '', answer = ''], n) => ({
  question,
  answer,
  lines: [
    said('user', question, `2026-10-08T09:0${2 * n}:00.000Z`),
    said('assistant', answer, `2026-10-08T09:0${2 * n + 1}:00.000Z`),
  ],
  at: `2026-10-08T09:0${2 * n + 1}:00.000Z`,
}));

/**
 * lantern-cove over a fake tmux whose claude ends a capture run as `run` says (two items by
 * default) and quits on /exit, with `deps` (a decision model's world). `session` opens one with
 * a goal and its conversation on disk; `land` ends each capture run as tmux's pane-died does.
 */
function captureWorld(
  run: Parameters<typeof finishesRun>[0] = {
    output: claudeAnswer(JSON.stringify([DECISION, NOTE])),
  },
  deps: Partial<MesaDeps> = {},
) {
  const inputs: string[] = [];
  const world = agentWorld({
    onOpen: (w) => {
      if (!w.launch.includes(CAPTURE)) return;
      const stdin = / <'([^']+)' >/.exec(w.launch)?.[1];
      if (stdin && existsSync(stdin)) inputs.push(readFileSync(stdin, 'utf8'));
      finishesRun(run)(w);
    },
    onKeys: (w, text) => {
      if (text === '/exit') w.dead = true;
    },
  });
  const profile = projectProfile(world.run, deps);
  const captures = () => world.tmux.opened.filter((w) => w.launch.includes(CAPTURE));
  const session = async () => {
    const { result } = await profile.mesa.sessions.open('lantern-cove', {
      goal: 'Make the tide feed reliable',
    });
    plantTranscript(
      profile.home,
      result.agentSessionId ?? '',
      profile.dir,
      CONVERSATION.map((line) => JSON.stringify(line)).join('\n'),
    );
    return result;
  };
  const land = async () => {
    for (const w of captures()) await profile.mesa.tmuxEvent('pane-died', 'lantern-cove', w.window);
  };
  /** Session `s`'s transcript holds the first `turns` of TURNS. */
  const converse = (s: { agentSessionId?: string }, turns: number) =>
    plantTranscript(
      profile.home,
      s.agentSessionId ?? '',
      profile.dir,
      TURNS.slice(0, turns)
        .flatMap((t) => t.lines)
        .join('\n'),
    );
  const receipts = () =>
    listReceipts(join(profile.home, 'vault')).filter((e) => e.receipt.kind === 'capture');
  return {
    ...profile,
    world,
    vault: join(profile.home, 'vault'),
    inputs,
    captures,
    session,
    converse,
    land,
    receipts,
  };
}

/** Ids whose session ids (`zzzz0001` on) are not sequentialIds', for a second writer. */
const laterIds = () => {
  let n = 0;
  return () => `01ZZZZ${'0'.repeat(12)}ZZZZ${String(++n).padStart(4, '0')}`;
};

/** The Markdown files under the vault's `folder`. */
const filesIn = (vault: string, folder: string) =>
  existsSync(join(vault, folder)) ? readdirSync(join(vault, folder)) : [];

test("a session's end starts one capture over its conversation, and its run lands both items under one receipt", async () => {
  const w = captureWorld();
  w.mesa.config.set('keys.tide', 'tide-key-0042');
  const s = await w.session();
  const inside = createMesa(
    'default',
    testDeps(w.home, { run: w.world.run, env: windowEnv(s.id, 'default'), newId: laterIds() }),
  );
  const end = JSON.stringify({
    session_id: s.agentSessionId,
    hook_event_name: 'SessionEnd',
    reason: 'prompt_input_exit',
  });
  // Every end signal of the session: its hook twice, then its pane dying.
  await inside.hookEvent('claude', end);
  await inside.hookEvent('claude', end);
  const pane = w.world.tmux.windows.find((x) => x.window === s.tmux.window);
  if (pane) pane.dead = true;
  await w.mesa.tmuxEvent('pane-died', 'lantern-cove', s.tmux.window);
  expect(w.captures()).toHaveLength(1);
  const running = testStore(w.home).get(s.id).capture;
  expect(running).toMatchObject({ state: 'running', run: expect.any(String) });
  // Its stdin: the conversation, redacted, never the agent's screen.
  expect(w.inputs[0]).toContain('[user] Should the tide feed retry on 503? ***');
  expect(w.inputs[0]).toContain('[assistant] Retry three times, 30 s apart');
  expect(w.inputs[0]).toContain('Its goal: Make the tide feed reliable');

  await w.land();
  const capture = testStore(w.home).get(s.id).capture;
  const [decision = '', note = ''] = capture?.notes ?? [];
  expect(decision).toMatch(/^wiki\/decisions\/\d{4}-\d\d-\d\d-tide-feed-retries-three-times\.md$/);
  expect(note).toBe('wiki/notes/the-tide-feed-answers-503-on-the-hour.md');
  expect(capture).toMatchObject({ run: running?.run, state: 'done', receipt: expect.any(String) });
  expect(readNote(w.vault, decision)).toMatchObject({
    frontmatter: {
      type: 'decision',
      project: 'lantern-cove',
      session: s.id,
      probabilities: DECISION.probabilities,
      confidence: 0.8,
      source: 'mesa',
    },
    body: expect.stringContaining('## Rationale\n\nThe feed rebuilds its cache'),
  });
  expect(readNote(w.vault, note)).toMatchObject({
    frontmatter: { type: 'note', project: 'lantern-cove', session: s.id },
    body: `# ${NOTE.title}\n\n${NOTE.body}\n`,
  });
  expect(readFileSync(join(w.vault, 'index.md'), 'utf8')).toContain(note.slice(0, -3));
  const [entry, ...more] = w.receipts();
  expect(more).toEqual([]);
  expect(entry?.path).toBe(capture?.receipt);
  // Not the captured session's own receipt, which a later stop or board look would rewrite.
  expect(sessionReceipt(w.vault, s.id)?.path).not.toBe(entry?.path);
  expect(entry?.receipt).toMatchObject({
    type: 'action',
    status: 'ok',
    project: 'lantern-cove',
    session: s.id,
    actor: running?.run,
    inputs: { session: s.id, run: running?.run },
    outputs: {
      notes: [decision, note],
      target: decision,
      items: [
        {
          kind: 'decision',
          title: DECISION.title,
          path: decision,
          changed: true,
          probabilities: DECISION.probabilities,
          confidence: 0.8,
        },
        { kind: 'note', title: NOTE.title, path: note, changed: true },
      ],
    },
  });
  // The run itself is a run: its own end captures nothing.
  expect(w.captures()).toHaveLength(1);
});

test('a capture updates the note of the same title instead of adding a second', async () => {
  const w = captureWorld({
    output: claudeAnswer(JSON.stringify([{ ...NOTE, body: 'It answers 503 for 10 s.' }])),
  });
  // Its title in another case is the same title.
  await w.mesa.vault.saveNote({
    project: 'lantern-cove',
    title: NOTE.title.toLocaleLowerCase(),
    body: 'Old words.',
  });
  const s = await w.session();
  // A stop whose agent exits is an end signal too.
  expect((await w.mesa.sessions.stop(s.id)).result.outcome).toBe('exited');
  expect(w.captures()).toHaveLength(1);
  await w.land();
  expect(filesIn(w.vault, 'wiki/notes')).toEqual(['the-tide-feed-answers-503-on-the-hour.md']);
  const path = 'wiki/notes/the-tide-feed-answers-503-on-the-hour.md';
  expect(readNote(w.vault, path).body).toBe(`# ${NOTE.title}\n\nIt answers 503 for 10 s.\n`);
  expect(testStore(w.home).get(s.id).capture).toMatchObject({ state: 'done', notes: [path] });
  expect(w.receipts()[0]?.receipt.outputs.items).toEqual([
    { kind: 'note', title: NOTE.title, path, changed: true },
  ]);
});

test("a person's note of the same title is never written over: the capture saves its own beside it", async () => {
  const w = captureWorld({ output: claudeAnswer(JSON.stringify([NOTE])) });
  const mine = `---\nproject: lantern-cove\ntype: note\n---\n# ${NOTE.title}\n\nMy own words.\n`;
  mkdirSync(join(w.vault, 'wiki/notes'), { recursive: true });
  writeFileSync(join(w.vault, 'wiki/notes/the-tide-feed-answers-503-on-the-hour.md'), mine);
  const s = await w.session();
  await w.mesa.sessions.stop(s.id);
  await w.land();
  expect(
    readFileSync(join(w.vault, 'wiki/notes/the-tide-feed-answers-503-on-the-hour.md'), 'utf8'),
  ).toBe(mine);
  expect(testStore(w.home).get(s.id).capture?.notes).toEqual([
    'wiki/notes/the-tide-feed-answers-503-on-the-hour-2.md',
  ]);
});

test('a session with nothing durable saves nothing and keeps no receipt', async () => {
  const w = captureWorld({ output: claudeAnswer('[]') });
  const s = await w.session();
  await w.mesa.sessions.stop(s.id);
  await w.land();
  expect(testStore(w.home).get(s.id).capture).toMatchObject({ state: 'done', notes: [] });
  expect(filesIn(w.vault, 'wiki/decisions')).toEqual([]);
  expect(filesIn(w.vault, 'wiki/notes')).toEqual([]);
  expect(w.receipts()).toEqual([]);
});

test('a failed run, or output that does not read, changes no note and says why in the record and a receipt', async () => {
  for (const [run, why] of [
    [{ output: claudeResult('not-logged-in'), status: 1 }, /Not logged in|exited with status 1/i],
    [{ output: claudeAnswer('I saved the decision for you.') }, /returned no JSON array/],
    [
      { output: claudeAnswer(JSON.stringify([DECISION, { kind: 'note', title: 'No body' }])) },
      /do not read at 1\.body/,
    ],
  ] as const) {
    const w = captureWorld(run);
    const s = await w.session();
    await w.mesa.sessions.stop(s.id);
    await w.land();
    const capture = testStore(w.home).get(s.id).capture;
    expect(capture).toMatchObject({ state: 'failed', reason: expect.stringMatching(why) });
    expect(capture?.notes).toBeUndefined();
    expect(filesIn(w.vault, 'wiki/decisions')).toEqual([]);
    expect(filesIn(w.vault, 'wiki/notes')).toEqual([]);
    const [entry, ...more] = w.receipts();
    expect(more).toEqual([]);
    expect(entry?.receipt).toMatchObject({
      status: 'failed',
      session: s.id,
      outputs: { error: { message: capture?.reason } },
    });
  }
});

test('runs, terminals, General, sessions with no conversation, no vault, or capture off are never captured', async () => {
  const w = captureWorld();
  const store = testStore(w.home, 'default', laterIds());
  /** A session record that died in its window, its conversation on disk under `agentSessionId`. */
  const ended = async (fields: Partial<NewSession>) => {
    const s = store.create((id) =>
      newSession({
        goal: 'Make the tide feed reliable',
        agentSessionId: `00000000-0000-4000-8000-0000000000${String(store.list().length).padStart(2, '0')}`,
        ...fields,
        tmux: {
          socket: 'mesa-default',
          session: fields.project ?? 'lantern-cove',
          window: `claude-${id}`,
        },
      }),
    );
    if (s.agentSessionId)
      plantTranscript(w.home, s.agentSessionId, w.dir, JSON.stringify(CONVERSATION[0]));
    await w.mesa.tmuxEvent('pane-died', s.tmux.session, s.tmux.window);
    return s;
  };
  await ended({ kind: 'run', goal: '/session-summary' });
  await ended({ kind: 'terminal', agent: 'terminal', goal: undefined, agentSessionId: undefined });
  await ended({ project: GENERAL_PROJECT, cwd: w.dir });
  await ended({ goal: undefined });
  await ended({ agent: 'antigravity' });
  renameSync(join(w.vault, 'log.md'), join(w.vault, 'log.away'));
  await ended({});
  renameSync(join(w.vault, 'log.away'), join(w.vault, 'log.md'));
  w.mesa.config.set('vault.capture', 'off');
  const off = await ended({});
  expect(w.captures()).toEqual([]);
  expect(store.get(off.id).capture).toBeUndefined();
  w.mesa.config.set('vault.capture', 'on');
  await ended({});
  expect(w.captures()).toHaveLength(1);
});

test('a related note of another title is never written over, whatever a Decision model would pick: the capture saves its own', async () => {
  const s1 = systemOneWorld();
  const timeout = {
    kind: 'decision',
    title: 'Feed timeout is 10 s',
    decision: 'The feed client gives up on a request after 10 s.',
    rationale: 'The feed answers within 2 s whenever it is up.',
  };
  const w = captureWorld({ output: claudeAnswer(JSON.stringify([timeout])) }, s1.deps);
  await w.mesa.decisions.keys.set('typesafe', TEST_TYPESAFE_KEY);
  const { result: policy } = await w.mesa.vault.saveDecision({
    project: 'lantern-cove',
    title: 'Feed retry policy',
    decision: 'The feed client retries a 503 three times.',
    rationale: 'The feed rebuilds its cache on the hour.',
  });
  const before = readFileSync(join(w.vault, policy.path), 'utf8');
  // Were it asked which note covers the item, the model would pick the retry policy.
  s1.lean({ option: `note:${policy.path}`, p: 0.9 });
  s1.requests.length = 0;
  const s = await w.session();
  await w.mesa.sessions.stop(s.id);
  await w.land();
  expect(s1.requests).toEqual([]);
  expect(readFileSync(join(w.vault, policy.path), 'utf8')).toBe(before);
  const notes = testStore(w.home).get(s.id).capture?.notes ?? [];
  expect(notes).toEqual([expect.stringMatching(/^wiki\/decisions\/.*feed-timeout-is-10-s\.md$/)]);
  expect(filesIn(w.vault, 'wiki/decisions')).toHaveLength(2);
  expect(w.receipts()[0]?.receipt.decisions ?? []).toEqual([]);
});

test('a claim whose run never started is taken again only after 10 minutes', async () => {
  let now = Date.parse('2026-09-24T12:00:00.000Z');
  const clock = () => new Date(now);
  const w = captureWorld(undefined, { clock });
  const s = await w.session();
  // A process claimed the capture and died before its run started.
  testStore(w.home).update(s.id, () => ({
    capture: { at: clock().toISOString(), state: 'running' },
  }));
  const inside = createMesa(
    'default',
    testDeps(w.home, {
      run: w.world.run,
      env: windowEnv(s.id, 'default'),
      newId: laterIds(),
      clock,
    }),
  );
  const end = JSON.stringify({
    session_id: s.agentSessionId,
    hook_event_name: 'SessionEnd',
    reason: 'prompt_input_exit',
  });
  now += 9 * 60_000;
  await inside.hookEvent('claude', end);
  expect(w.captures()).toEqual([]);
  now += 2 * 60_000;
  await inside.hookEvent('claude', end);
  expect(w.captures()).toHaveLength(1);
  expect(testStore(w.home).get(s.id).capture).toMatchObject({
    at: clock().toISOString(),
    state: 'running',
    run: expect.any(String),
  });
});

test('a forced stop, and a Board look that finds an exit no signal reported, each start the capture', async () => {
  for (const end of ['forced stop', 'board look'] as const) {
    const w = captureWorld();
    const s = await w.session();
    if (end === 'forced stop') {
      expect((await w.mesa.sessions.stop(s.id, true)).result.outcome).toBe('killed');
    } else {
      const pane = w.world.tmux.windows.find((x) => x.window === s.tmux.window);
      if (pane) pane.dead = true;
      await w.mesa.sessions.list();
      await w.mesa.sessions.list();
    }
    expect(w.captures(), end).toHaveLength(1);
    await w.land();
    expect(testStore(w.home).get(s.id).capture, end).toMatchObject({ state: 'done' });
  }
});

test('a newest message longer than the conversation budget is kept, clipped, so the capture still runs', async () => {
  const w = captureWorld();
  const s = await w.session();
  const long = {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: `Tide log: ${'ebb flood '.repeat(12_000)}` }],
    },
  };
  plantTranscript(
    w.home,
    s.agentSessionId ?? '',
    w.dir,
    [...CONVERSATION, long].map((line) => JSON.stringify(line)).join('\n'),
  );
  await w.mesa.sessions.stop(s.id);
  expect(w.captures()).toHaveLength(1);
  const lines = (w.inputs[0] ?? '').split('\n');
  const kept = lines.filter((line) => line.startsWith('['));
  expect(kept).toHaveLength(1);
  expect(kept[0]).toMatch(/^\[assistant\] Tide log: ebb flood .*\.\.\.$/);
  expect(kept[0]?.length).toBe(100_000);
  await w.land();
  expect(testStore(w.home).get(s.id).capture).toMatchObject({ state: 'done' });
});

test('mesa vault capture runs it by hand, waited for, again after an automatic one, and only on an agent session', async () => {
  const w = captureWorld({ output: claudeAnswer(JSON.stringify([NOTE])) });
  const s = await w.session();
  w.converse(s, 1);
  const { result, receipt } = await w.mesa.vault.capture(s.id);
  const path = 'wiki/notes/the-tide-feed-answers-503-on-the-hour.md';
  expect(result).toEqual({ session: s.id, run: expect.any(String), ok: true, notes: [path] });
  expect(receipt?.path).toBe(testStore(w.home).get(s.id).capture?.receipt);
  // The same note from newer words changes nothing: no note, no receipt.
  w.converse(s, 2);
  const again = await w.mesa.vault.capture(s.id);
  expect(again.result).toMatchObject({ ok: true, notes: [] });
  expect(w.receipts()).toHaveLength(1);
  const terminal = testStore(w.home, 'default', laterIds()).create(() =>
    newSession({ kind: 'terminal', agent: 'terminal' }),
  );
  await expect(w.mesa.vault.capture(terminal.id)).rejects.toMatchObject({ code: 'usage' });
});

test('a run that returns more than 5 items keeps its first 5', () => {
  const notes = Array.from({ length: 6 }, (_, n) => ({
    kind: 'note',
    title: `Tide ${n}`,
    body: 'x',
  }));
  expect(captureItems(JSON.stringify(notes)).map((i) => i.title)).toEqual(
    notes.slice(0, 5).map((n) => n.title),
  );
});

test("a capture marks the newest message it was given; a resumed session's end reads only newer ones, and starts nothing when none are", async () => {
  const w = captureWorld({ output: claudeAnswer(JSON.stringify([NOTE])) });
  const store = testStore(w.home);
  const s = await w.session();
  w.converse(s, 1);
  await w.mesa.sessions.stop(s.id);
  await w.land();
  expect(store.get(s.id).capture).toMatchObject({ state: 'done', through: TURNS[0]?.at });
  expect(store.get(s.id).capture?.upTo).toBeUndefined();
  // mesa show prints the record's capture, mark and all.
  expect((await w.mesa.sessions.show(s.id)).capture?.through).toBe(TURNS[0]?.at);

  const resumed = (await w.mesa.sessions.resume(s.id)).result.record;
  w.converse(resumed, 2);
  await w.mesa.sessions.stop(resumed.id);
  expect(w.captures()).toHaveLength(2);
  expect(w.inputs[1]).toContain(`[user] ${TURNS[1]?.question}`);
  expect(w.inputs[1]).toContain(`[assistant] ${TURNS[1]?.answer}`);
  expect(w.inputs[1]).not.toContain(TURNS[0]?.question);
  expect(w.inputs[1]).toContain('the newest 2 messages');
  await w.land();
  expect(store.get(resumed.id).capture).toMatchObject({ state: 'done', through: TURNS[1]?.at });

  // Resumed again and ended with nothing said: no run.
  const again = (await w.mesa.sessions.resume(resumed.id)).result.record;
  await w.mesa.sessions.stop(again.id);
  expect(w.captures()).toHaveLength(2);
  expect(store.get(again.id).capture).toBeUndefined();
});

test('a failed capture keeps the mark, and the next end tries the same messages again', async () => {
  const run: Parameters<typeof finishesRun>[0] = { output: claudeAnswer(JSON.stringify([NOTE])) };
  const w = captureWorld(run);
  const store = testStore(w.home);
  const s = await w.session();
  w.converse(s, 1);
  await w.mesa.sessions.stop(s.id);
  await w.land();
  run.output = claudeAnswer('I saved it for you.');
  const resumed = (await w.mesa.sessions.resume(s.id)).result.record;
  w.converse(resumed, 2);
  await w.mesa.sessions.stop(resumed.id);
  await w.land();
  expect(store.get(resumed.id).capture).toMatchObject({
    state: 'failed',
    through: TURNS[0]?.at,
  });
  run.output = claudeAnswer(JSON.stringify([NOTE]));
  const again = (await w.mesa.sessions.resume(resumed.id)).result.record;
  await w.mesa.sessions.stop(again.id);
  expect(w.captures()).toHaveLength(3);
  expect(w.inputs[2]).toContain(TURNS[1]?.question);
  expect(w.inputs[2]).not.toContain(TURNS[0]?.question);
  await w.land();
  expect(store.get(again.id).capture).toMatchObject({ state: 'done', through: TURNS[1]?.at });
});

test('a capture by hand of a live session marks it: its end captures only what was said after, or nothing', async () => {
  for (const more of [true, false]) {
    const w = captureWorld({ output: claudeAnswer(JSON.stringify([NOTE])) });
    const s = await w.session();
    w.converse(s, 1);
    expect((await w.mesa.vault.capture(s.id)).result).toMatchObject({ ok: true });
    expect(testStore(w.home).get(s.id).capture?.through).toBe(TURNS[0]?.at);
    // Nothing newer to capture by hand either.
    await expect(w.mesa.vault.capture(s.id)).rejects.toMatchObject({ code: 'usage' });
    if (more) w.converse(s, 2);
    await w.mesa.sessions.stop(s.id);
    expect(w.captures(), String(more)).toHaveLength(more ? 2 : 1);
    if (!more) continue;
    expect(w.inputs[1]).toContain(TURNS[1]?.question);
    expect(w.inputs[1]).not.toContain(TURNS[0]?.question);
    await w.land();
    expect(testStore(w.home).get(s.id).capture).toMatchObject({
      state: 'done',
      through: TURNS[1]?.at,
    });
  }
});

test("a Claude background session's exit, found by a Board look, starts its capture", async () => {
  let native: 'active' | 'stopped' = 'active';
  let base: Runner | undefined;
  const agentSessionId = 'abcdef12-0000-4000-8000-000000000001';
  const run: Runner = (file, args, ms, options) => {
    if (file === 'claude' && args[0] === '--bg')
      return Promise.resolve({ ok: true, stdout: 'backgrounded · abcdef12\n' });
    if (file === 'claude' && args[0] === 'agents') {
      const row = {
        id: 'abcdef12',
        kind: 'background',
        cwd: options?.cwd ?? '',
        sessionId: agentSessionId,
      };
      const state =
        native === 'stopped' ? { state: 'stopped' } : { pid: 1234, status: 'idle', state: 'done' };
      return Promise.resolve({
        ok: true,
        stdout: JSON.stringify([{ ...row, startedAt: 1790251200000, ...state }]),
      });
    }
    if (!base) throw new Error('no world yet');
    return base(file, args, ms, options);
  };
  const w = captureWorld(undefined, { run });
  base = w.world.run;
  const { result: s } = await w.mesa.sessions.open('lantern-cove', {
    background: true,
    goal: 'Make the tide feed reliable',
  });
  w.converse({ agentSessionId }, 1);
  await w.mesa.sessions.list();
  expect(w.captures()).toEqual([]);
  native = 'stopped';
  await w.mesa.sessions.list();
  await w.mesa.sessions.list();
  expect(w.captures()).toHaveLength(1);
  expect(w.inputs[0]).toContain(TURNS[0]?.question);
  await w.land();
  expect(testStore(w.home).get(s.id).capture).toMatchObject({
    state: 'done',
    through: TURNS[0]?.at,
  });
});

test('with capture off, an end reads no transcript: the switch is checked first', async () => {
  const w = captureWorld();
  const ends = async () => {
    const s = await w.session();
    // A transcripts folder that cannot be read: any look into it fails.
    const transcripts = claudeTranscripts(w.home, {});
    rmSync(transcripts, { recursive: true });
    writeFileSync(transcripts, '');
    const { warning } = await w.mesa.sessions.stop(s.id);
    rmSync(transcripts);
    return warning ?? '';
  };
  w.mesa.config.set('vault.capture', 'off');
  expect(await ends()).not.toMatch(/vault capture/);
  w.mesa.config.set('vault.capture', 'on');
  expect(await ends()).toMatch(/vault capture did not start: .*ENOTDIR/);
  expect(w.captures()).toEqual([]);
});

test('a capture that landed before marks were kept covers the conversation up to its time', async () => {
  const w = captureWorld();
  const s = await w.session();
  w.converse(s, 2);
  // As #697 left it: done, with no mark.
  testStore(w.home).update(s.id, () => ({
    capture: { at: '2026-10-08T09:01:30.000Z', state: 'done', notes: [] },
  }));
  await w.mesa.sessions.stop(s.id);
  expect(w.captures()).toHaveLength(1);
  expect(w.inputs[0]).toContain(TURNS[1]?.question);
  expect(w.inputs[0]).not.toContain(TURNS[0]?.question);
});

test('a Board look captures only an exit it found itself, so a failed capture is not run again on every look', async () => {
  for (const found of ['board look', 'pane-died hook'] as const) {
    const w = captureWorld({ output: claudeAnswer('I saved it for you.') });
    const s = await w.session();
    w.converse(s, 1);
    const pane = w.world.tmux.windows.find((x) => x.window === s.tmux.window);
    if (pane) pane.dead = true;
    if (found === 'pane-died hook')
      await w.mesa.tmuxEvent('pane-died', 'lantern-cove', s.tmux.window);
    await w.mesa.sessions.list();
    expect(w.captures(), found).toHaveLength(1);
    await w.land();
    expect(testStore(w.home).get(s.id).capture, found).toMatchObject({ state: 'failed' });
    for (let look = 0; look < 3; look++) await w.mesa.sessions.list();
    expect(w.captures(), found).toHaveLength(1);
  }
});

test('with capture off, a Board look that finds an exit reads no transcript', async () => {
  const read = vi.spyOn(AGENTS.claude.transcripts, 'messages');
  try {
    for (const on of [false, true]) {
      const w = captureWorld();
      w.mesa.config.set('vault.capture', on ? 'on' : 'off');
      const s = await w.session();
      w.converse(s, 1);
      read.mockClear();
      const pane = w.world.tmux.windows.find((x) => x.window === s.tmux.window);
      if (pane) pane.dead = true;
      await w.mesa.sessions.list();
      expect(read.mock.calls.length > 0, `capture ${on ? 'on' : 'off'}`).toBe(on);
      expect(w.captures()).toHaveLength(on ? 1 : 0);
    }
  } finally {
    read.mockRestore();
  }
});
