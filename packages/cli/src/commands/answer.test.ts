import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

// Claude Code's permission dialog as captured live (docs/spikes/prompt-answers.md).
const DIALOG = [
  ' Bash command',
  ' touch beacon.txt',
  ' Do you want to proceed?',
  ' ❯ 1. Yes',
  '   2. No',
  '',
  ' Esc to cancel · Tab to amend',
].join('\n');

/** A claude session waiting on a Bash permission, its PermissionRequest logged. */
async function waiting() {
  const world = cli.withTmux();
  await cli.withProject({ layOut: false });
  const id = (await mesa('open', 'lantern-cove', '--json')).json.data.id as string;
  const events = join(cli.home, '.mesa/default/sessions/events');
  mkdirSync(events, { recursive: true });
  const payload = { tool_name: 'Bash', tool_input: { command: 'touch beacon.txt' } };
  const line = {
    at: '2026-09-24T11:59:00.000Z',
    agent: 'claude',
    event: 'PermissionRequest',
    payload,
  };
  appendFileSync(join(events, `${id}.jsonl`), `${JSON.stringify(line)}\n`);
  const window = world.windows[0];
  if (!window) throw new Error('no window');
  window.screen = DIALOG;
  return { id, window };
}

test('mesa prompt --json prints the pending prompt; mesa answer allow presses its key', async () => {
  const { id, window } = await waiting();
  const shown = await mesa('prompt', id, '--json');
  expect(shown.json.data).toMatchObject({
    status: 'pending',
    kind: 'permission',
    summary: 'touch beacon.txt',
    options: [
      { id: 'allow', label: 'Allow' },
      { id: 'deny', label: 'Deny' },
    ],
  });
  expect((await mesa('prompt', id)).stdout).toBe(
    `permission ${shown.json.data.id}: touch beacon.txt\n  allow: Allow\n  deny: Deny\n`,
  );
  const answered = await mesa('answer', id, 'allow', '--prompt', shown.json.data.id, '--json');
  expect(answered.json.data).toMatchObject({ answered: true, option: 'allow', answer: 'Allow' });
  expect(window.keys).toEqual(['1']);
});

test('an agent caller is refused, a stale answer says so, and --via takes a known caller', async () => {
  const { id, window } = await waiting();
  cli.env = { MESA_SESSION_ID: 'zzzzzzzz', MESA_PROFILE: 'default' };
  expect(await mesa('answer', id, 'allow')).toMatchObject({
    code: 2,
    stderr: `only a person answers a prompt; answer it there (mesa attach ${id})\n`,
  });
  cli.env = {};
  expect(await mesa('answer', id, 'allow', '--via', 'pager')).toMatchObject({
    code: 2,
    stderr: '--via must be one of cli, app, phone\n',
  });
  window.screen = '❯ ';
  expect(await mesa('answer', id, 'allow')).toMatchObject({
    code: 2,
    stderr: `stale answer: session ${id} waits on no prompt Mesa can answer now\n`,
  });
  expect(window.keys).toEqual([]);
});
