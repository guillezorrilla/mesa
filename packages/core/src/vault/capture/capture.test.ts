import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { AGENTS } from '../../agents/agents.js';
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
  movableClock,
  newSession,
  plantTranscript,
  projectProfile,
  systemOneWorld,
  TEST_TYPESAFE_KEY,
  testDeps,
  testStore,
} from '../../testing/index.js';
import { readNote } from '../notes.js';
import { CAPTURE_EVERY_MS, CAPTURE_MIN_MESSAGES } from './claim.js';
import { captureItems } from './items.js';

// Vault capture (CONTEXT.md): a turn's end, once enough has been said since the last capture,
// starts one vault-capture run over the new conversation, and the run's end lands its decisions
// and notes, all or none, under one receipt. No end of a session starts one.

/** Talk before the tide question, so the conversation is long enough for a turn to capture. */
const CHATTER = Array.from({ length: CAPTURE_MIN_MESSAGES - 2 }, (_, n) =>
  n % 2
    ? {
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: `Read harbour log ${n}.` }] },
      }
    : { type: 'user', message: { role: 'user', content: `Open harbour log ${n + 1}.` } },
);
/** Ten messages: chatter, then the tide question and its answer. */
const CONVERSATION = [
  ...CHATTER,
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
/**
 * A conversation that goes on: each turn ten messages a minute apart from 09:00, a question and
 * its answer, then asides, so each turn alone is enough for a turn's end to capture.
 */
const TURNS = [
  ['Which port does the tide feed use?', 'Port 7341, as the harbour proxy expects.'],
  ['Should the tide feed cache on disk?', 'No: it rebuilds hourly, so memory is enough.'],
  ['Who owns the tide feed alerts?', 'The harbour team, paged after 3 failures.'],
].map(([question = '', answer = ''], n) => {
  const at = (k: number) => `2026-10-08T09:${String(10 * n + k).padStart(2, '0')}:00.000Z`;
  const asides = Array.from({ length: CAPTURE_MIN_MESSAGES - 2 }, (_, k) =>
    said(k % 2 ? 'assistant' : 'user', `Turn ${n} aside ${k}.`, at(k + 2)),
  );
  return {
    question,
    answer,
    lines: [said('user', question, at(0)), said('assistant', answer, at(1)), ...asides],
    at: at(CAPTURE_MIN_MESSAGES - 1),
  };
});

/** Ids whose session ids (`zzzz0001` on) are not sequentialIds', for a second writer. */
const laterIds = () => {
  let n = 0;
  return () => `01ZZZZ${'0'.repeat(12)}ZZZZ${String(++n).padStart(4, '0')}`;
};

/** A session as a hook names it: its Mesa id and its agent's own. */
type Hooked = { id: string; agentSessionId?: string };

/**
 * lantern-cove over a fake tmux whose claude ends a capture run as `run` says (two items by
 * default) and quits on /exit, with `deps` (a decision model's world), on a clock the test moves
 * (`time`). `session` opens one with a goal and its conversation on disk; `turnEnd` passes time
 * (20 minutes by default) and sends its agent's Stop hook from inside its window; `land` ends
 * each capture run as tmux's pane-died does.
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
  const time = movableClock();
  const profile = projectProfile(world.run, { clock: time.clock, ...deps });
  // One id source for every writer inside a session's window, apart from the profile's own.
  const ids = laterIds();
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
  /** Mesa as session `s`'s own window runs it: where its agent's hooks call. */
  const inside = (s: { id: string }) =>
    createMesa(
      'default',
      testDeps(profile.home, {
        run: world.run,
        ...deps,
        clock: time.clock,
        env: windowEnv(s.id, 'default'),
        newId: ids,
      }),
    );
  /** Session `s`'s agent hook `event`, with `fields` beside its name and session id. */
  const hook = (s: Hooked, event: string, fields: object = {}) =>
    inside(s).hookEvent(
      'claude',
      JSON.stringify({ session_id: s.agentSessionId, hook_event_name: event, ...fields }),
    );
  /** A turn of session `s` ends `after` ms from now: its agent's Stop hook. */
  const turnEnd = (s: Hooked, after = CAPTURE_EVERY_MS) => {
    time.pass(after);
    return hook(s, 'Stop', { stop_hook_active: false });
  };
  const land = async () => {
    for (const w of captures()) await profile.mesa.tmuxEvent('pane-died', 'lantern-cove', w.window);
  };
  /** Session `s`'s transcript holds the first `count` messages of TURNS. */
  const say = (s: { agentSessionId?: string }, count: number) =>
    plantTranscript(
      profile.home,
      s.agentSessionId ?? '',
      profile.dir,
      TURNS.flatMap((t) => t.lines)
        .slice(0, count)
        .join('\n'),
    );
  /** Session `s`'s transcript holds the first `turns` of TURNS. */
  const converse = (s: { agentSessionId?: string }, turns: number) =>
    say(s, turns * CAPTURE_MIN_MESSAGES);
  const receipts = () =>
    listReceipts(join(profile.home, 'vault')).filter((e) => e.receipt.kind === 'capture');
  return {
    ...profile,
    world,
    time,
    ids,
    vault: join(profile.home, 'vault'),
    inputs,
    captures,
    session,
    hook,
    turnEnd,
    say,
    converse,
    land,
    receipts,
  };
}

/** The Markdown files under the vault's `folder`. */
const filesIn = (vault: string, folder: string) =>
  existsSync(join(vault, folder)) ? readdirSync(join(vault, folder)) : [];

test("a turn's end with 10 new messages and no capture in 20 minutes starts one run, which lands both items under one receipt", async () => {
  const w = captureWorld();
  w.mesa.config.set('keys.tide', 'tide-key-0042');
  const s = await w.session();
  // Two turns end at once: the second finds the first's run in flight.
  await w.turnEnd(s);
  await w.turnEnd(s, 0);
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

test("a turn's end inside 20 minutes of the last capture, or with fewer than 10 new messages, starts none", async () => {
  const w = captureWorld({ output: claudeAnswer(JSON.stringify([NOTE])) });
  const store = testStore(w.home);
  const s = await w.session();
  w.say(s, CAPTURE_MIN_MESSAGES - 1);
  await w.turnEnd(s);
  expect(w.captures()).toEqual([]);
  expect(store.get(s.id).capture).toBeUndefined();
  w.say(s, CAPTURE_MIN_MESSAGES);
  await w.turnEnd(s, 0);
  expect(w.captures()).toHaveLength(1);
  await w.land();
  expect(store.get(s.id).capture).toMatchObject({ state: 'done', through: TURNS[0]?.at });

  // Ten more, but a minute short of 20 since that capture; then the minute passes.
  w.converse(s, 2);
  await w.turnEnd(s, CAPTURE_EVERY_MS - 60_000);
  expect(w.captures()).toHaveLength(1);
  await w.turnEnd(s, 60_000);
  expect(w.captures()).toHaveLength(2);
  expect(w.inputs[1]).toContain(TURNS[1]?.question);
  expect(w.inputs[1]).not.toContain(TURNS[0]?.question);
});

test('no end of a session starts a capture or reads its transcript: SessionEnd, pane-died, a stop, a Board look, archive and rm', async () => {
  const read = vi.spyOn(AGENTS.claude.transcripts, 'messages');
  try {
    for (const end of [
      'SessionEnd',
      'pane-died',
      'stop',
      'forced stop',
      'board look',
      'archive',
      'rm',
    ] as const) {
      const w = captureWorld();
      const s = await w.session();
      // Due by every other measure: ten messages, 20 minutes after it started.
      w.time.pass(CAPTURE_EVERY_MS);
      read.mockClear();
      const pane = w.world.tmux.windows.find((x) => x.window === s.tmux.window);
      if (end === 'SessionEnd') {
        await w.hook(s, 'SessionEnd', { reason: 'prompt_input_exit' });
        if (pane) pane.dead = true;
        await w.mesa.tmuxEvent('pane-died', 'lantern-cove', s.tmux.window);
      } else if (end === 'pane-died') {
        if (pane) pane.dead = true;
        await w.mesa.tmuxEvent('pane-died', 'lantern-cove', s.tmux.window);
      } else if (end === 'board look') {
        if (pane) pane.dead = true;
        await w.mesa.sessions.list();
        await w.mesa.sessions.list();
      } else if (end === 'stop') {
        expect((await w.mesa.sessions.stop(s.id)).result.outcome).toBe('exited');
      } else if (end === 'forced stop') {
        expect((await w.mesa.sessions.stop(s.id, true)).result.outcome).toBe('killed');
      } else if (end === 'archive') {
        await w.mesa.sessions.archive(s.id);
      } else {
        const { result } = await w.mesa.sessions.remove(s.id, { force: true });
        expect(Object.keys(result)).not.toContain('capture');
        expect(testStore(w.home).find(s.id)).toBeUndefined();
      }
      expect(w.captures(), end).toEqual([]);
      expect(read, end).not.toHaveBeenCalled();
      if (end !== 'rm') expect(testStore(w.home).get(s.id).capture, end).toBeUndefined();
    }
  } finally {
    read.mockRestore();
  }
});

test("a turn's end that is not due reads no transcript: capture off, or inside 20 minutes", async () => {
  const read = vi.spyOn(AGENTS.claude.transcripts, 'messages').mockImplementation(() => {
    throw new Error('a transcript was read');
  });
  try {
    const w = captureWorld();
    const s = await w.session();
    w.mesa.config.set('vault.capture', 'off');
    await w.turnEnd(s);
    w.mesa.config.set('vault.capture', 'on');
    const fresh = await w.session();
    await w.turnEnd(fresh, CAPTURE_EVERY_MS - 60_000);
    expect(read).not.toHaveBeenCalled();
    // Once it is due, the transcript is read: here the read fails, and the turn's hook does not.
    await expect(w.turnEnd(fresh, 60_000)).resolves.toBeDefined();
    expect(read).toHaveBeenCalled();
    expect(w.captures()).toEqual([]);
  } finally {
    read.mockRestore();
  }
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
  await w.turnEnd(s);
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
  await w.turnEnd(s);
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
  await w.turnEnd(s);
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
    await w.turnEnd(s);
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

test('runs, terminals, General, Antigravity, sessions with no conversation, no vault, or capture off are never captured', async () => {
  const w = captureWorld();
  const store = testStore(w.home, 'default', w.ids);
  /** A session record whose turn ends, its conversation on disk under `agentSessionId`. */
  const turned = async (fields: Partial<NewSession>) => {
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
      plantTranscript(
        w.home,
        s.agentSessionId,
        w.dir,
        CONVERSATION.map((line) => JSON.stringify(line)).join('\n'),
      );
    await w.turnEnd(s);
    return s;
  };
  await turned({ kind: 'run', goal: '/session-summary' });
  await turned({ kind: 'terminal', agent: 'terminal', goal: undefined, agentSessionId: undefined });
  await turned({ project: GENERAL_PROJECT, cwd: w.dir });
  await turned({ goal: undefined });
  await turned({ agent: 'antigravity' });
  renameSync(join(w.vault, 'log.md'), join(w.vault, 'log.away'));
  await turned({});
  renameSync(join(w.vault, 'log.away'), join(w.vault, 'log.md'));
  w.mesa.config.set('vault.capture', 'off');
  const off = await turned({});
  expect(w.captures()).toEqual([]);
  expect(store.get(off.id).capture).toBeUndefined();
  w.mesa.config.set('vault.capture', 'on');
  await turned({});
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
  await w.turnEnd(s);
  await w.land();
  expect(s1.requests).toEqual([]);
  expect(readFileSync(join(w.vault, policy.path), 'utf8')).toBe(before);
  const notes = testStore(w.home).get(s.id).capture?.notes ?? [];
  expect(notes).toEqual([expect.stringMatching(/^wiki\/decisions\/.*feed-timeout-is-10-s\.md$/)]);
  expect(filesIn(w.vault, 'wiki/decisions')).toHaveLength(2);
  expect(w.receipts()[0]?.receipt.decisions ?? []).toEqual([]);
});

test('a claim whose run never started is taken again only after 10 minutes', async () => {
  const w = captureWorld();
  const s = await w.session();
  // A process claimed the capture and died before its run started.
  testStore(w.home).update(s.id, () => ({
    capture: { at: w.time.clock().toISOString(), state: 'running' },
  }));
  w.time.pass(9 * 60_000);
  await expect(w.mesa.vault.capture(s.id)).rejects.toMatchObject({ code: 'usage' });
  expect(w.captures()).toEqual([]);
  w.time.pass(2 * 60_000);
  expect((await w.mesa.vault.capture(s.id)).result).toMatchObject({ ok: true });
  expect(w.captures()).toHaveLength(1);
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
  await w.turnEnd(s);
  expect(w.captures()).toHaveLength(1);
  const lines = (w.inputs[0] ?? '').split('\n');
  const kept = lines.filter((line) => line.startsWith('['));
  expect(kept).toHaveLength(1);
  expect(kept[0]).toMatch(/^\[assistant\] Tide log: ebb flood .*\.\.\.$/);
  expect(kept[0]?.length).toBe(100_000);
  await w.land();
  expect(testStore(w.home).get(s.id).capture).toMatchObject({ state: 'done' });
});

test('mesa vault capture runs it by hand, waited for, past the turn throttle, and only on an agent session', async () => {
  const w = captureWorld({ output: claudeAnswer(JSON.stringify([NOTE])) });
  const s = await w.session();
  // Two messages, a minute after it started: a turn's end would wait, a capture by hand does not.
  w.say(s, 2);
  w.time.pass(60_000);
  const { result, receipt } = await w.mesa.vault.capture(s.id);
  const path = 'wiki/notes/the-tide-feed-answers-503-on-the-hour.md';
  expect(result).toEqual({ session: s.id, run: expect.any(String), ok: true, notes: [path] });
  expect(receipt?.path).toBe(testStore(w.home).get(s.id).capture?.receipt);
  // The same note from newer words changes nothing: no note, no receipt.
  w.say(s, 3);
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

test("a capture marks the newest message it was given; a resumed session's turn reads only newer ones, and starts nothing when none are", async () => {
  const w = captureWorld({ output: claudeAnswer(JSON.stringify([NOTE])) });
  const store = testStore(w.home);
  const s = await w.session();
  w.converse(s, 1);
  await w.turnEnd(s);
  await w.land();
  expect(store.get(s.id).capture).toMatchObject({ state: 'done', through: TURNS[0]?.at });
  expect(store.get(s.id).capture?.upTo).toBeUndefined();
  // mesa show prints the record's capture, mark and all.
  expect((await w.mesa.sessions.show(s.id)).capture?.through).toBe(TURNS[0]?.at);

  await w.mesa.sessions.stop(s.id);
  const resumed = (await w.mesa.sessions.resume(s.id)).result.record;
  w.converse(resumed, 2);
  await w.turnEnd(resumed);
  expect(w.captures()).toHaveLength(2);
  expect(w.inputs[1]).toContain(`[user] ${TURNS[1]?.question}`);
  expect(w.inputs[1]).toContain(`[assistant] ${TURNS[1]?.answer}`);
  expect(w.inputs[1]).not.toContain(TURNS[0]?.question);
  expect(w.inputs[1]).toContain(`the newest ${CAPTURE_MIN_MESSAGES} messages`);
  await w.land();
  expect(store.get(resumed.id).capture).toMatchObject({ state: 'done', through: TURNS[1]?.at });

  // Resumed again, and a turn ends with nothing new said: no run.
  await w.mesa.sessions.stop(resumed.id);
  const again = (await w.mesa.sessions.resume(resumed.id)).result.record;
  await w.turnEnd(again);
  expect(w.captures()).toHaveLength(2);
  expect(store.get(again.id).capture).toBeUndefined();
});

test("a failed capture keeps the mark, and a later turn's end tries the same messages again", async () => {
  const run: Parameters<typeof finishesRun>[0] = { output: claudeAnswer(JSON.stringify([NOTE])) };
  const w = captureWorld(run);
  const store = testStore(w.home);
  const s = await w.session();
  w.converse(s, 1);
  await w.turnEnd(s);
  await w.land();
  run.output = claudeAnswer('I saved it for you.');
  w.converse(s, 2);
  await w.turnEnd(s);
  await w.land();
  expect(store.get(s.id).capture).toMatchObject({ state: 'failed', through: TURNS[0]?.at });
  run.output = claudeAnswer(JSON.stringify([NOTE]));
  await w.turnEnd(s);
  expect(w.captures()).toHaveLength(3);
  expect(w.inputs[2]).toContain(TURNS[1]?.question);
  expect(w.inputs[2]).not.toContain(TURNS[0]?.question);
  await w.land();
  expect(store.get(s.id).capture).toMatchObject({ state: 'done', through: TURNS[1]?.at });
});

test("a capture by hand of a live session marks it: a later turn's end captures only what was said after, or nothing", async () => {
  for (const more of [true, false]) {
    const w = captureWorld({ output: claudeAnswer(JSON.stringify([NOTE])) });
    const s = await w.session();
    w.converse(s, 1);
    expect((await w.mesa.vault.capture(s.id)).result).toMatchObject({ ok: true });
    expect(testStore(w.home).get(s.id).capture?.through).toBe(TURNS[0]?.at);
    // Nothing newer to capture by hand either.
    await expect(w.mesa.vault.capture(s.id)).rejects.toMatchObject({ code: 'usage' });
    if (more) w.converse(s, 2);
    await w.turnEnd(s);
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

test("a Claude background session's exit, found by a Board look, starts no capture", async () => {
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
  w.time.pass(CAPTURE_EVERY_MS);
  await w.mesa.sessions.list();
  native = 'stopped';
  await w.mesa.sessions.list();
  await w.mesa.sessions.list();
  expect(
    testStore(w.home)
      .get(s.id)
      .events.some((e) => e.type === 'exited'),
  ).toBe(true);
  expect(w.captures()).toEqual([]);
});

test('a capture that landed before marks were kept covers the conversation up to its time', async () => {
  const w = captureWorld();
  const s = await w.session();
  w.converse(s, 2);
  // As #697 left it: done, with no mark.
  testStore(w.home).update(s.id, () => ({
    capture: { at: '2026-10-08T09:09:30.000Z', state: 'done', notes: [] },
  }));
  w.time.set('2026-10-08T12:00:00.000Z');
  await w.turnEnd(s, 0);
  expect(w.captures()).toHaveLength(1);
  expect(w.inputs[0]).toContain(TURNS[1]?.question);
  expect(w.inputs[0]).not.toContain(TURNS[0]?.question);
});

test('a session removed while its capture runs is removed at once; its run lands nothing', async () => {
  const w = captureWorld();
  const s = await w.session();
  await w.turnEnd(s);
  expect(w.captures()).toHaveLength(1);
  await w.mesa.sessions.remove(s.id, { force: true });
  expect(testStore(w.home).find(s.id)).toBeUndefined();
  await w.land();
  expect(filesIn(w.vault, 'wiki/decisions')).toEqual([]);
  expect(w.receipts()).toEqual([]);
});
