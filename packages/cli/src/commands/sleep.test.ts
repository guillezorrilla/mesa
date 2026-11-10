import { testStore } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('sleep puts an idle session to sleep, sessions shows it, and wake reopens it in the same session', async () => {
  const tmux = cli.withTmux({
    onKeys: (w, text) => {
      if (text === '/exit') w.dead = true;
    },
  });
  await cli.withProject();
  const id = (await mesa('open', 'lantern-cove')).stdout.trim();
  // Idle and read for an hour, by an invented conversation id.
  testStore(cli.home).update(id, {
    agentSessionId: '36c173f2-803e-4845-bd97-a032b37c6d6d',
    lastState: { state: 'idle', confidence: 0.95, at: '2026-09-24T11:00:00.000Z', source: 'hook' },
  });
  // Off by default: nothing sleeps.
  expect((await mesa('sleep', '--json')).json.data).toEqual({ slept: [] });
  await mesa('config', 'set', 'sessions.sleepAfterMinutes', '30');
  expect((await mesa('sleep', '--shown', id, '--json')).json.data).toEqual({ slept: [] });
  expect((await mesa('sleep', '--json')).json.data).toEqual({ slept: [id] });
  expect(tmux.windows.some((w) => w.window === `claude-${id}`)).toBe(false);

  const rows = (await mesa('sessions', '--json')).json.data;
  expect(rows.find((r: { id: string }) => r.id === id)).toMatchObject({
    sleeping: { at: expect.any(String) },
    lastState: { state: 'idle' },
  });

  const woke = await mesa('wake', id, '--json');
  expect(woke.json.data).toMatchObject({ id });
  expect(woke.json.data.sleeping).toBeUndefined();
  const window = tmux.windows.find((w) => w.window === `claude-${id}`);
  expect(window?.launch).toContain('--resume 36c173f2-803e-4845-bd97-a032b37c6d6d');
  expect((await mesa('wake', id, '--json')).json.error).toMatchObject({
    code: 'usage',
    message: `session ${id} is not asleep; mesa attach ${id}`,
  });
});

test('send to a sleeping session wakes it first, and --json says woke', async () => {
  const tmux = cli.withTmux({
    onKeys: (w, text) => {
      if (text === '/exit') w.dead = true;
    },
  });
  await cli.withProject();
  const id = (await mesa('open', 'lantern-cove')).stdout.trim();
  testStore(cli.home).update(id, {
    agentSessionId: '36c173f2-803e-4845-bd97-a032b37c6d6d',
    lastState: { state: 'idle', confidence: 0.95, at: '2026-09-24T11:00:00.000Z', source: 'hook' },
  });
  await mesa('config', 'set', 'sessions.sleepAfterMinutes', '30');
  expect((await mesa('sleep', '--json')).json.data.slept).toEqual([id]);
  // No hook fires in the harness, so the wait runs out and the send types anyway, and says so.
  const sent = await mesa('send', id, 'what is left?', '--no-from', '--json');
  expect(sent.json.data).toMatchObject({ sent: true, session: id, woke: true });
  expect(sent.json.data.warning).toContain('took no input in 30 s');
  expect(tmux.windows.find((w) => w.window === `claude-${id}`)?.typed).toEqual(['what is left?']);
});
