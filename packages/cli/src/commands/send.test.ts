import { mkdirSync, rmSync } from 'node:fs';
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

test('a send typed with a warning keeps it beside a receipt warning in --json', async () => {
  cli.withTmux();
  // No vault layout, so every receipt warns too.
  await mesa('init', '--vault', 'vault');
  mkdirSync(join(cli.home, 'src/lantern-cove'), { recursive: true });
  await mesa('register', '--create', join(cli.home, 'src/lantern-cove'));
  const b = (await mesa('open', 'lantern-cove', '--json')).json.data.id;
  const lock = staleLock(cli.home, b);
  const sent = await mesa('send', b, 'hello', '--json');
  expect(sent.code).toBe(0);
  expect(sent.json.data.warning).toMatch(
    /^the prompt was typed, but no send event on .*; do not send it again; no log line: /,
  );
  rmSync(lock);
});
