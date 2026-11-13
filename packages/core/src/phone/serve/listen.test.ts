import { expect, test } from 'vitest';
import {
  claudePromptPane,
  movableClock,
  plantHookEvent,
  servingPhone,
  untilTrue,
} from '../../testing/index.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 200));
const counted = (ran: { file: string; args: string[] }[], command: string) => () =>
  ran.filter((call) => call.file === 'tmux' && call.args.includes(command)).length;

test('a watching phone gets a look only after a file a row is read from changed', async () => {
  const { mesa, session, calls, pushed, ran, end } = await servingPhone();
  const looks = counted(ran, 'list-windows');
  await calls.call({ method: 'sessions' });
  // The writes that set the profile up are heard a moment late.
  await settle();
  const first = looks();
  await settle();
  // The loop ran many times meanwhile (its waits are instant here), and a call read the last look.
  await calls.call({ method: 'sessions' });
  expect(looks()).toBe(first);

  mesa.sessions.rename(session.id, 'Login fix, round 2');
  expect(await untilTrue(() => pushed.some((m) => m.kind === 'update'))).toBe(true);
  expect(looks()).toBeGreaterThan(first);
  await end();
});

test("a look captures a waiting session's pane again only when its state or time changed", async () => {
  const { mesa, home, world, session, calls, pushed, ran, end } = await servingPhone();
  const { result: opened } = await mesa.sessions.open('lantern-cove', { agent: 'claude' });
  const window = world.windows[0];
  if (!window) throw new Error('no window opened');
  const payload = { tool_name: 'Bash', tool_input: { command: 'touch beacon.txt' } };
  const hook = (at: string) =>
    plantHookEvent(home, {
      session: opened.id,
      agent: 'claude',
      at,
      event: 'PermissionRequest',
      payload,
    });
  hook('2026-09-24T11:59:00.000Z');
  window.screen = claudePromptPane('bash');
  const captures = counted(ran, 'capture-pane');
  // A board look sets the pane-died hook first, and reads each pane once itself (Faro's tail: this
  // test's agent listing says nothing), so what the asks read is what was captured beyond that.
  const looks = counted(ran, 'set-hook');
  const since = (at: { captures: number; looks: number }) =>
    captures() - at.captures - (looks() - at.looks);
  const now = () => ({ captures: captures(), looks: looks() });
  const ask = async () =>
    (await calls.call({ method: 'sessions' })).rows.find((row) => row.id === opened.id)?.ask;

  expect(await ask()).toBe('Bash: touch beacon.txt');
  await settle();
  const read = now();
  // Another session changed: the board is looked at again, the waiting pane's ask is kept.
  mesa.sessions.rename(session.id, 'Login fix, round 2');
  expect(await untilTrue(() => pushed.some((m) => m.kind === 'update'))).toBe(true);
  expect(await ask()).toBe('Bash: touch beacon.txt');
  expect(looks()).toBeGreaterThan(read.looks);
  expect(since(read)).toBe(0);

  // The same session asks again: its ask is read anew.
  const before = now();
  hook('2026-09-24T11:59:30.000Z');
  expect(await untilTrue(() => since(before) > 0)).toBe(true);
  await end();
});

test('a look slowed by a loaded Mac keeps the socket; a wait that ran long dials again', async () => {
  const time = movableClock();
  let slow = false;
  const at = await servingPhone(undefined, {
    clock: time.clock,
    // A look on a loaded Mac: a minute passes while tmux answers.
    tmux: (command) => {
      if (slow && command.includes('list-windows')) time.pass(60_000);
    },
  });
  await at.calls.call({ method: 'sessions' });
  const dialed = at.dials();
  slow = true;
  at.mesa.sessions.rename(at.session.id, 'Login fix, round 2');
  expect(await untilTrue(() => at.pushed.some((m) => m.kind === 'update'))).toBe(true);
  await settle();
  expect(at.dials()).toBe(dialed);

  slow = false;
  // The Mac slept: the wait between looks ran an hour.
  const asleep = () => {
    time.pass(3_600_000);
    return at.dials() > dialed;
  };
  expect(await untilTrue(asleep)).toBe(true);
  await at.end();
});
