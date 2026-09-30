import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { profilePaths } from '../profile/paths.js';
import { listReceipts } from '../receipts/store.js';
import {
  CLAUDE_MOUNT,
  CLAUDE_VERSION,
  type FakeWindow,
  fakeTmux,
  newSession,
  plantOutputLog,
  projectProfile,
  scriptedRunner,
  staleLock,
  testStore,
  timedAgentWorld,
} from '../testing/index.js';
import { sessionStore } from './store.js';

/**
 * A profile with its vault laid out, lantern-cove registered, and one session opened in a fake
 * tmux. Its claude hears what is typed and, when `quits`, exits on /exit.
 */
async function setUp({
  quits = true,
  duringSleep = () => {},
  beforeTmux = (_args: string[], _world: ReturnType<typeof fakeTmux>) => {},
} = {}) {
  const heard: string[] = [];
  const world = fakeTmux({
    onKeys: (w: FakeWindow, text: string) => {
      heard.push(text);
      if (quits && text === '/exit') w.dead = true;
    },
  });
  const scripted = scriptedRunner({
    tmux: (args) => {
      beforeTmux(args, world);
      return world.answer(args);
    },
    claude: CLAUDE_VERSION,
  });
  const sleeps: number[] = [];
  const sleep = async (ms: number) => {
    sleeps.push(ms);
    duringSleep();
  };
  const { home, mesa } = projectProfile(scripted.run, { sleep });
  const { result: opened } = await mesa.sessions.open('lantern-cove');
  const receipts = () =>
    listReceipts(join(home, 'vault'), 50).filter((e) => e.receipt.type === 'session');
  return { home, mesa, world, opened, sleeps, heard, calls: scripted.calls, receipts };
}

test('stop presses Escape, types /exit, waits for the pane to die, and removes the window', async () => {
  const { mesa, world, opened, heard, calls, receipts } = await setUp();
  const { result, receipt } = await mesa.sessions.stop(opened.id);
  expect(result.outcome).toBe('exited');
  expect(heard).toEqual(['/exit']);
  // Escape first, so a pending permission prompt is dismissed, never answered by the Enter.
  const keys = calls.filter((c) => c.args[4] === 'send-keys').map((c) => c.args.at(-1));
  expect(keys).toEqual(['Escape', '/exit', 'Enter']);
  expect(world.windows).toEqual([]);
  expect(result.record).toMatchObject({
    endedAt: '2026-09-24T12:00:00.000Z',
    lastState: { state: 'done', confidence: 1, source: 'mesa' },
  });
  expect(receipt).toBeNull();
  expect(receipts()).toEqual([]);
});

/** 250 lines of output as a terminal writes them, the last two naming the home folder and a key. */
const output = (home: string) =>
  [
    ...Array.from({ length: 248 }, (_, n) => `\x1b[2mline ${n + 1}\x1b[0m`),
    `Wrote ${home}/src/lantern-cove/tides.md`,
    'Used tide-key-0042 in ```js fetch()```',
  ].join('\r\n');

test('stop leaves terminal output local and no transcript in the vault', async () => {
  const { home, mesa, opened, receipts } = await setUp();
  mesa.config.set('keys.tide', 'tide-key-0042');
  plantOutputLog(home, opened.id, output(home));
  await mesa.sessions.stop(opened.id);
  expect(receipts()).toEqual([]);
  expect(mesa.sessions.logs(opened.id).lines.join('\n')).toContain('Used tide-key-0042');
});

test('resume retains the old local output without creating a vault receipt', async () => {
  const { home, mesa, world, opened, receipts } = await setUp();
  plantOutputLog(home, opened.id, 'All tests pass.\r\n');
  const [pane] = world.windows;
  if (pane) pane.dead = true;
  const { result } = await mesa.sessions.resume(opened.id);
  expect(mesa.sessions.logs(opened.id).lines).toContain('All tests pass.');

  // Its successor's log is there, and empty: nothing to copy.
  const next = result.record.id;
  plantOutputLog(home, next, '\x1b[2J\r\n');
  await mesa.sessions.stop(next);
  expect(receipts()).toEqual([]);
});

test("an agent's exit updates its local state without copying output to the vault", async () => {
  const { home, mesa, world, opened, receipts } = await setUp();
  mesa.config.set('keys.tide', 'tide-key-0042');
  plantOutputLog(home, opened.id, output(home));
  const [pane] = world.windows;
  if (pane) {
    pane.dead = true;
    pane.status = 3;
  }
  expect((await mesa.tmuxEvent('pane-died', 'lantern-cove', `claude-${opened.id}`))?.id).toBe(
    opened.id,
  );
  expect(testStore(home).get(opened.id).lastState.state).toBe('failed');
  expect(testStore(home).get(opened.id).endedAt).toBeUndefined();
  expect(receipts()).toEqual([]);

  plantOutputLog(home, opened.id, `${output(home)}\r\nBye`);
  await mesa.sessions.stop(opened.id);
  expect(receipts()).toEqual([]);
  expect(mesa.sessions.logs(opened.id).lines).toContain('Bye');
});

test('an agent that ignores /exit is killed after 5 s', async () => {
  const { mesa, world, opened, sleeps } = await setUp({ quits: false });
  const { result } = await mesa.sessions.stop(opened.id);
  expect(result.outcome).toBe('killed');
  // 300 ms for Escape to land, then the 5 s wait.
  expect(sleeps.reduce((a, b) => a + b, 0)).toBe(5300);
  expect(world.windows).toEqual([]);
});

test('--force kills at once; stopping it again changes nothing, receipts included', async () => {
  const { mesa, opened, heard, calls, receipts } = await setUp();
  const { result } = await mesa.sessions.stop(opened.id, true);
  expect(result.outcome).toBe('killed');
  expect(heard).toEqual([]); // nothing typed first

  const [before, count] = [calls.length, receipts()];
  const again = await mesa.sessions.stop(opened.id);
  expect(again).toMatchObject({
    result: { record: result.record, outcome: 'already-ended' },
    receipt: null,
  });
  expect(calls.length).toBe(before); // no tmux call
  expect(receipts()).toEqual(count);
});

test('a pane that already exited is ended and its dead window removed; a gone window just ends', async () => {
  const exited = await setUp();
  const pane = exited.world.windows[0];
  if (pane) pane.dead = true; // claude exited; remain-on-exit kept the pane
  expect((await exited.mesa.sessions.stop(exited.opened.id)).result.outcome).toBe('exited');
  expect(exited.heard).toEqual([]);
  expect(exited.world.windows).toEqual([]);

  const gone = await setUp();
  gone.world.windows.splice(0); // it crashed, or tmux was restarted
  const { result } = await gone.mesa.sessions.stop(gone.opened.id);
  expect(result.outcome).toBe('gone');
  expect(result.record.endedAt).toBe('2026-09-24T12:00:00.000Z');
});

test('stop keeps a failed state failed', async () => {
  const { home, mesa, opened } = await setUp();
  const store = testStore(home);
  const failed = {
    state: 'failed',
    confidence: 0.85,
    at: '2026-09-24T11:59:00.000Z',
    source: 'tmux',
  } as const;
  store.update(opened.id, { lastState: failed });
  expect((await mesa.sessions.stop(opened.id)).result.record.lastState).toEqual(failed);
});

test('resume reopens the conversation with claude --resume in a new window, linked both ways', async () => {
  const { home, mesa, world, opened, receipts } = await setUp();
  await mesa.sessions.stop(opened.id);
  const { result } = await mesa.sessions.resume(opened.id);
  expect(result.record).toMatchObject({
    project: 'lantern-cove',
    agentSessionId: opened.agentSessionId,
    resumedFrom: opened.id,
    tmux: { window: `claude-${result.record.id}` },
  });
  expect(result.from).toMatchObject({ id: opened.id, resumedBy: result.record.id });
  expect(world.windows).toMatchObject([
    {
      window: `claude-${result.record.id}`,
      path: join(home, 'src/lantern-cove'),
      launch: `unset NO_COLOR; exec claude --resume ${opened.agentSessionId} ${CLAUDE_MOUNT}`,
    },
  ]);
  expect(receipts()).toEqual([]);
  await expect(mesa.sessions.resume(opened.id)).rejects.toMatchObject({
    code: 'usage',
    message: `session ${opened.id} was already resumed as ${result.record.id}; mesa resume ${result.record.id}`,
  });
});

test('resume refuses a live session, clears a dead window, and needs an agent session id', async () => {
  const live = await setUp();
  await expect(live.mesa.sessions.resume(live.opened.id)).rejects.toMatchObject({
    code: 'usage',
    message: `session ${live.opened.id} is still running; mesa attach ${live.opened.id}, or mesa stop ${live.opened.id} first`,
  });

  const exited = await setUp();
  const left = exited.world.windows[0];
  if (left) left.dead = true;
  const { result } = await exited.mesa.sessions.resume(exited.opened.id);
  expect(exited.world.windows.map((w) => w.window)).toEqual([`claude-${result.record.id}`]);
  expect(result.from.endedAt).toBe('2026-09-24T12:00:00.000Z');
  expect(exited.receipts()).toEqual([]);

  const store = sessionStore({
    dir: profilePaths(exited.home, 'default').sessions,
    newId: () => '01TESTZZZZZZZZZZZZZZNOUUID',
  });
  const { id } = store.create(() => newSession());
  await expect(exited.mesa.sessions.resume(id)).rejects.toMatchObject({
    code: 'not_found',
    message: `session ${id} has no agent session id to resume; start a new one with mesa open lantern-cove`,
  });
});

test('stop ends the record as it is when the stop lands, not as it was read', async () => {
  let failNow = () => {};
  const { home, mesa, opened } = await setUp({ quits: false, duringSleep: () => failNow() });
  const store = testStore(home);
  const failed = {
    state: 'failed',
    confidence: 0.85,
    at: '2026-09-24T12:00:00.000Z',
    source: 'tmux',
  } as const;
  // The agent fails while stop waits for it to quit.
  failNow = () => store.update(opened.id, { lastState: failed });
  const { result } = await mesa.sessions.stop(opened.id);
  expect(result.record.lastState).toEqual(failed);
});

test('resume with its old record locked still runs, warns, and is not resumed twice', async () => {
  const { home, mesa, opened } = await setUp();
  await mesa.sessions.stop(opened.id);
  const lock = staleLock(home, opened.id);
  const first = await mesa.sessions.resume(opened.id);
  expect(first.warning).toMatch(new RegExp(`^session ${opened.id} not marked resumed: session`));
  rmSync(lock);
  await expect(mesa.sessions.resume(opened.id)).rejects.toMatchObject({
    code: 'usage',
    message: `session ${opened.id} was already resumed as ${first.result.record.id}; mesa resume ${first.result.record.id}`,
  });
});

test('resume goes on when the dead window it removes has gone already', async () => {
  // Something else removes the window between resume's look and its kill-window.
  const { mesa, world, opened } = await setUp({
    beforeTmux: (args, w) => {
      if (args.includes('kill-window')) w.windows.splice(0);
    },
  });
  const [window] = world.windows;
  if (window) window.dead = true;
  const { result } = await mesa.sessions.resume(opened.id);
  expect(result.record.resumedFrom).toBe(opened.id);
});

test("stop types /exit into codex 0.3 s before its Enter; claude's Enter follows at once", async () => {
  const world = timedAgentWorld({
    onKeys: (w, text) => {
      if (text === '/exit') w.dead = true;
    },
  });
  const { log } = world;
  const { mesa } = projectProfile(world.run, { sleep: world.sleep });
  for (const agent of ['codex', 'claude']) {
    const { result: opened } = await mesa.sessions.open('lantern-cove', { agent });
    log.length = 0;
    expect((await mesa.sessions.stop(opened.id)).result.outcome).toBe('exited');
    // The first pause lets the Escape land alone; codex's second keeps its Enter from being
    // read as part of a paste (docs/spikes/codex.md).
    expect(log, agent).toEqual(
      agent === 'codex'
        ? ['keys Escape', 'sleep 300', 'keys /exit', 'sleep 300', 'keys Enter']
        : ['keys Escape', 'sleep 300', 'keys /exit', 'keys Enter'],
    );
  }
});

test.each(['dead pane', 'missing window'])(
  'the Board updates local state without a receipt after a missed exit hook: %s',
  async (signal) => {
    const { home, mesa, world, opened, receipts } = await setUp();
    mesa.config.set('keys.tide', 'tide-key-0042');
    plantOutputLog(home, opened.id, output(home));
    if (signal === 'missing window') world.windows.splice(0);
    else Object.assign(world.windows[0] ?? {}, { dead: true, status: 2 });
    const state = signal === 'dead pane' ? 'failed' : 'done';
    for (let look = 0; look < 2; look++) {
      const rows = await mesa.sessions.list(true);
      expect(rows.find((r) => r.id === opened.id)?.lastState.state).toBe(state);
      expect(receipts()).toEqual([]);
      expect(testStore(home).get(opened.id).endedAt).toBeUndefined();
    }
  },
);

test('a Board look repairs a missed exit without a vault entry', async () => {
  const { home, mesa, world, opened, receipts } = await setUp();
  Object.assign(world.windows[0] ?? {}, { dead: true, status: 2 });
  await mesa.sessions.list();
  await mesa.sessions.list();
  expect(testStore(home).get(opened.id).lastState.state).toBe('failed');
  expect(receipts()).toEqual([]);
});
