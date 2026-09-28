import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { staleLock } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('send prints {sent, session, chars}; a gone session is exit 3', async () => {
  const world = cli.withTmux();
  await cli.withProject({ layOut: false });
  const id = (await mesa('open', 'lantern-cove')).stdout.split('\n')[0] ?? '';
  const { json } = await mesa('send', id, 'say hello', '--json');
  expect(json.data).toMatchObject({ sent: true, session: id, chars: 9 });
  expect(world.windows[0]?.typed).toEqual(['say hello']);
  expect((await mesa('send', id, 'again')).stdout.split('\n')[0]).toBe(
    `sent 5 characters to ${id}`,
  );
  world.windows.splice(0);
  expect(await mesa('send', id, 'hi')).toMatchObject({ code: 3 });
});

test('send --from, or from inside a window, adds the sender; --json prints {sent, session, from, chars}', async () => {
  const world = cli.withTmux();
  await cli.withProject({ layOut: false });
  const a = (await mesa('open', 'lantern-cove', '--json')).json.data.id;
  const b = (await mesa('open', 'lantern-cove', '--json')).json.data.id;
  const sent = await mesa('send', b, 'Reply with pong', '--from', a, '--json');
  expect(sent.json.data).toMatchObject({ sent: true, session: b, from: a, chars: 15 });
  expect(world.windows.find((w) => w.window === `claude-${b}`)?.typed.at(-1)).toBe(
    `[mesa] from session ${a} (lantern-cove). Reply with: mesa send ${a} "<reply>"\nReply with pong`,
  );

  cli.env = { MESA_SESSION_ID: b, MESA_PROFILE: 'default' };
  expect((await mesa('send', a, 'pong')).stdout.split('\n')[0]).toBe(
    `sent 4 characters to ${a} from ${b}`,
  );
  expect(await mesa('send', b, 'to myself')).toMatchObject({
    code: 2,
    stderr: `session ${b} cannot send to itself\n`,
  });
  // As a person, from inside the window: no header, and its own session takes it.
  expect((await mesa('send', b, 'from me', '--no-from', '--json')).json.data.from).toBeNull();
  expect(await mesa('send', a, 'hi', '--from', 'zzzzzzzz')).toMatchObject({
    code: 3,
    stderr: 'no session zzzzzzzz to send from; see mesa sessions\n',
  });
});

test('a send typed with a warning remains actionable without a routine receipt warning', async () => {
  cli.withTmux();
  // No vault layout is needed for a routine send.
  await mesa('init', '--vault', 'vault');
  mkdirSync(join(cli.home, 'src/lantern-cove'), { recursive: true });
  await mesa('register', '--create', join(cli.home, 'src/lantern-cove'));
  const b = (await mesa('open', 'lantern-cove', '--json')).json.data.id;
  const lock = staleLock(cli.home, b);
  const sent = await mesa('send', b, 'hello', '--json');
  expect(sent.code).toBe(0);
  expect(sent.json.data.warning).toMatch(
    /^the prompt was typed, but no send event on .*; do not send it again$/,
  );
  rmSync(lock);
});

test('a destructive prompt is blocked with exit 5; --force sends it', async () => {
  const world = cli.withTmux();
  await cli.withProject({ layOut: false });
  const id = (await mesa('open', 'lantern-cove', '--json')).json.data.id;
  expect(await mesa('send', id, 'run rm -rf /')).toMatchObject({
    code: 5,
    stderr:
      'blocked: the text holds a destructive command (rm -rf); pass --force to send it anyway\n',
  });
  // --yes does not pass a block, and a person is never asked about one.
  cli.answer = true;
  expect((await mesa('send', id, 'run rm -rf /', '--yes')).code).toBe(5);
  expect(cli.asked).toEqual([]);
  const forced = await mesa('send', id, 'run rm -rf /', '--force', '--json');
  expect(forced.json.data).toMatchObject({ sent: true, override: 'force' });
  expect(world.windows[0]?.typed).toEqual(['run rm -rf /']);
});

test('a strict project asks y/N in a terminal; with --json or none, it is exit 5 unless --yes', async () => {
  const world = cli.withTmux();
  const dir = await cli.withProject({ layOut: false });
  writeFileSync(join(dir, 'mesa.yaml'), 'name: lantern-cove\nguardrail: strict\n');
  const id = (await mesa('open', 'lantern-cove', '--json')).json.data.id;

  // No terminal: nobody to ask.
  const none = await mesa('send', id, 'hello', '--json');
  expect(none.code).toBe(5);
  expect(none.json.error).toMatchObject({
    code: 'guardrail_blocked',
    message:
      'the guardrail asks first: project lantern-cove has guardrail: strict; pass --yes to send it',
    details: {
      verdict: 'ask',
      reason: 'project lantern-cove has guardrail: strict',
      decision: { answers: [{ id: 'verdict', answer: 'ask' }, { answer: false }] },
    },
  });

  // A person at the terminal answers; --json never asks, even there.
  cli.answer = false;
  expect(await mesa('send', id, 'hello')).toMatchObject({
    code: 5,
    stderr: 'declined: project lantern-cove has guardrail: strict\n',
  });
  cli.answer = true;
  // The first line: without a vault layout, a receipt warning follows.
  expect((await mesa('send', id, 'hello')).stdout.split('\n')[0]).toBe(
    `sent 5 characters to ${id}`,
  );
  expect(cli.asked).toEqual([
    'Project lantern-cove has guardrail: strict. Send it?',
    'Project lantern-cove has guardrail: strict. Send it?',
  ]);
  expect((await mesa('send', id, 'hello', '--json')).code).toBe(5);
  expect(cli.asked).toHaveLength(2);

  const yes = await mesa('send', id, 'again', '--yes', '--json');
  expect(yes.json.data).toMatchObject({ sent: true, override: 'yes' });
  expect(world.windows[0]?.typed).toEqual(['hello', 'again']);
});
