import { join } from 'node:path';
import { expect, test } from 'vitest';
import { listReceipts } from '../../receipts/store.js';
import { livePhoneSession, plantOutputLog, servingPhone } from '../../testing/index.js';
import { phoneCall } from '../protocol/rpc.js';

/** A plain terminal session the phone drives, opened on the listener's profile. */
async function terminal() {
  const at = await servingPhone();
  const { id } = (await at.mesa.sessions.open('lantern-cove', { terminal: true })).result;
  const window = at.world.windows.find((w) => w.env.MESA_SESSION_ID === id);
  if (!window) throw new Error('no window opened');
  return { ...at, id, window };
}

test("a terminal session's screen opens: its row says terminal, and it has no replies", async () => {
  const at = await terminal();
  const row = (await at.calls.call({ method: 'sessions' })).rows.find((r) => r.id === at.id);
  expect(row).toMatchObject({ terminal: true });
  expect(await at.calls.call({ method: 'session', id: at.id })).toMatchObject({
    row: { id: at.id, terminal: true },
    replies: [],
  });
  await at.end();
});

test('a line from the phone is typed with Enter through the guardrail, never queued, and keys are pressed', async () => {
  const at = await terminal();
  expect(await at.calls.call({ method: 'send', id: at.id, text: 'ls' })).toEqual({
    status: 'sent',
  });
  expect(at.window.typed).toEqual(['ls']);
  expect(at.window.keys.slice(-1)).toEqual(['Enter']);
  const [receipt] = listReceipts(join(at.home, 'vault'), 5, { kind: 'guardrail' });
  expect(receipt?.receipt).toMatchObject({
    status: 'ok',
    inputs: { session: at.id, line: 'ls', via: 'phone' },
  });

  expect(await at.calls.call({ method: 'send', id: at.id, text: 'rm -rf /', yes: true })).toEqual({
    status: 'blocked',
    reason: expect.stringContaining('destructive'),
  });
  expect(at.window.typed).toEqual(['ls']);

  await at.calls.call({ method: 'keys', id: at.id, keys: ['C-c', 'Up', 'Enter'] });
  expect(at.window.keys.slice(-3)).toEqual(['C-c', 'Up', 'Enter']);
  const [pressed] = listReceipts(join(at.home, 'vault'), 5, { kind: 'guardrail' });
  expect(pressed?.receipt).toMatchObject({
    status: 'ok',
    inputs: { session: at.id, keys: ['C-c', 'Up', 'Enter'], via: 'phone' },
  });
  await expect(
    at.calls.call({ method: 'send', id: at.id, text: 'look', image: 'AAAA' }),
  ).rejects.toThrow('takes no photo');
  await at.end();
});

test('the live output is the log tail, and an unknown key never reaches the Mac', async () => {
  const at = await terminal();
  plantOutputLog(at.home, at.id, '$ ls\nREADME.md\nsrc\n');
  expect(await at.calls.call({ method: 'output', id: at.id })).toEqual({
    lines: ['$ ls', 'README.md', 'src'],
  });
  expect(phoneCall.safeParse({ method: 'keys', id: at.id, keys: ['rm'] }).success).toBe(false);
  await at.end();
});

test('the screen sizes the window to the phone and draws its pane with the cursor where it is', async () => {
  const at = await terminal();
  plantOutputLog(at.home, at.id, '$ ls\n');
  at.window.screen = '\x1b[34m$ ls\x1b[0m\nREADME.md\n\n';
  at.window.cursor = { x: 2, y: 2 };
  expect(await at.calls.call({ method: 'screen', id: at.id, cols: 44, rows: 30 })).toEqual({
    text: '\x1b[34m$ ls\x1b[0m\r\nREADME.md\r\n\x1b[3;3H',
    at: 5,
  });
  // Sized for the phone now, and back to tmux's own policy, so the Mac's view takes it back.
  expect(at.window.size).toEqual({ cols: 44, rows: 30, pinned: false });
  await at.end();
});

test('mesa type and mesa keys refuse an agent session and an unknown key', async () => {
  const at = await servingPhone();
  const { id } = await livePhoneSession(at);
  await expect(at.mesa.sessions.terminal.type(id, 'ls')).rejects.toThrow('mesa send types into it');
  const { id: shell } = (await at.mesa.sessions.open('lantern-cove', { terminal: true })).result;
  await expect(at.mesa.sessions.terminal.keys(shell, ['Delete'])).rejects.toThrow(
    'unknown keys Delete',
  );
  await at.end();
});
