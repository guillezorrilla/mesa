import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { listReceipts } from '../receipts.js';
import {
  type FakeWindow,
  fakeTmux,
  newSession,
  scriptedRunner,
  tempDir,
  testDeps,
} from '../testing.js';
import { sessionStore } from './store.js';

/**
 * A profile with its vault laid out, lantern-cove registered, and one session opened in a fake
 * tmux. Its claude hears what is typed and, when `quits`, exits on /exit.
 */
async function setUp({ quits = true } = {}) {
  const home = tempDir();
  const heard: string[] = [];
  const world = fakeTmux({
    onKeys: (w: FakeWindow, text: string) => {
      heard.push(text);
      if (quits && text === '/exit') w.dead = true;
    },
  });
  const scripted = scriptedRunner({ tmux: world.answer, claude: '2.1.282 (Claude Code)' });
  const sleeps: number[] = [];
  const sleep = async (ms: number) => {
    sleeps.push(ms);
  };
  const mesa = createMesa('default', testDeps(home, { run: scripted.run, sleep }));
  mesa.init({ vault: 'vault' });
  mesa.vault.init();
  mkdirSync(join(home, 'src/lantern-cove'), { recursive: true });
  mesa.projects.register(join(home, 'src/lantern-cove'), true);
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
  // The stop has its own receipt; the opening one is marked ended.
  const [stopped, openedReceipt] = receipts();
  expect(stopped?.receipt).toMatchObject({
    id: receipt?.id,
    status: 'ok',
    session: opened.id,
    outputs: { outcome: 'exited', lastState: 'done' },
  });
  expect(stopped?.summary).toBe(`Stopped session ${opened.id} (exited)`);
  expect(openedReceipt?.receipt).toMatchObject({
    ended: '2026-09-24T12:00',
    outputs: { lastState: 'done' },
  });
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
  const store = sessionStore({ dir: join(home, '.mesa/default/sessions'), newId: () => 'x' });
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
      launch: `claude --resume ${opened.agentSessionId}`,
    },
  ]);
  expect(receipts()[0]?.receipt).toMatchObject({
    session: result.record.id,
    outputs: { resumedFrom: opened.id },
  });
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
  // The old session's opening receipt is marked ended by the resume.
  expect(exited.receipts().at(-1)?.receipt.ended).toBe('2026-09-24T12:00');

  const store = sessionStore({
    dir: join(exited.home, '.mesa/default/sessions'),
    newId: () => '01TESTZZZZZZZZZZZZZZNOUUID',
  });
  const { id } = store.create(() => newSession());
  await expect(exited.mesa.sessions.resume(id)).rejects.toMatchObject({
    code: 'not_found',
    message: `session ${id} has no agent session id to resume; start a new one with mesa open lantern-cove`,
  });
});
