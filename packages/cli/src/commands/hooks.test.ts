import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fakeTmux, scriptedRunner } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('hooks install, status, uninstall, and a hook appending its payload', async () => {
  await mesa('init', '--vault', 'vault');
  expect((await mesa('hooks', 'status', '--json')).json.data.installed).toBe(false);
  const installed = await mesa('hooks', 'install', '--json');
  expect(installed.json.data).toMatchObject({ installed: true, changed: true });
  expect((await mesa('hooks', 'install')).stdout).toBe('hooks already installed\n');

  // A hook from a Mesa session appends to its log; from anything else it records nothing.
  cli.stdin = JSON.stringify({ session_id: 'uuid-1', hook_event_name: 'Stop' });
  expect((await mesa('hook', 'claude', '--json')).json.data).toEqual({
    recorded: false,
    event: null,
  });
  cli.env = { MESA_SESSION_ID: 'aaaaaaaa' };
  expect((await mesa('hook', 'claude', '--json')).json.data).toEqual({
    recorded: true,
    event: 'Stop',
  });
  const log = readFileSync(join(cli.home, '.mesa/default/sessions/events/aaaaaaaa.jsonl'), 'utf8');
  expect(JSON.parse(log)).toMatchObject({
    agent: 'claude',
    event: 'Stop',
    agentSessionId: 'uuid-1',
  });
  expect(await mesa('hook', 'codex')).toMatchObject({ code: 7 });

  cli.env = {};
  expect((await mesa('hooks', 'uninstall', '--json')).json.data).toMatchObject({
    installed: false,
    changed: true,
  });
  expect(readFileSync(join(cli.home, '.claude/settings.json'), 'utf8')).toBe('{}\n');
});

test('a hook in a session refuses to log while config.yaml does not read, so no key leaks', async () => {
  await mesa('init', '--vault', 'vault');
  await mesa('config', 'set', 'keys.api', 'sk-live-1234');
  const events = join(cli.home, '.mesa/default/sessions/events/aaaaaaaa.jsonl');
  cli.stdin = JSON.stringify({ hook_event_name: 'Stop', prompt: 'my key is sk-live-1234' });
  cli.env = { MESA_SESSION_ID: 'aaaaaaaa' };
  await mesa('hook', 'claude');
  expect(readFileSync(events, 'utf8')).not.toContain('sk-live-1234');

  const config = join(cli.home, '.mesa/default/config.yaml');
  writeFileSync(config, `${readFileSync(config, 'utf8')}surprise: 1\n`);
  const before = readFileSync(events, 'utf8');
  expect(await mesa('hook', 'claude')).toMatchObject({ code: 4 });
  expect(readFileSync(events, 'utf8')).toBe(before);
  // Outside a session the hook still records nothing, and says so, whatever the config.
  cli.env = {};
  expect(await mesa('hook', 'claude', '--json')).toMatchObject({
    code: 0,
    json: { data: { recorded: false, event: null } },
  });
});

test('mesa hook tmux pane-died records its exit; hooks status and doctor show both hooks', async () => {
  const world = fakeTmux();
  cli.run = scriptedRunner({ tmux: world.answer, claude: '2.1.282 (Claude Code)' }).run;
  await cli.withProject({ layOut: false });
  const status = async () => (await mesa('hooks', 'status', '--json')).json.data.tmux;
  const doctorRow = async (name: string) =>
    (await mesa('doctor', '--json')).json.data.checks.find(
      (c: { name: string }) => c.name === name,
    );
  // No server yet: nothing to hook, so doctor is fine with it.
  expect(await status()).toEqual({ socket: 'mesa-default', server: false, paneDied: false });
  expect(await doctorRow('tmux hooks')).toMatchObject({
    status: 'ok',
    hint: 'no server on mesa-default yet',
  });
  expect(await doctorRow('claude hooks')).toMatchObject({
    status: 'warn',
    hint: 'not installed: run `mesa hooks install`',
  });

  const id = (await mesa('open', 'lantern-cove', '--json')).json.data.id;
  // Opening started the server, and with it the hook, running this mesa for this profile.
  expect(await status()).toEqual({ socket: 'mesa-default', server: true, paneDied: true });
  expect(world.hooks.get('pane-died')).toBe(
    `run-shell -b "'/usr/local/bin/mesa' --profile 'default' hook tmux pane-died -- #{q:session_name} #{q:window_name} >/dev/null 2>&1 || :"`,
  );
  expect((await doctorRow('tmux hooks')).status).toBe('ok');
  // A server whose hook runs another mesa is a warning with its fix, and a look sets it again.
  world.hooks.set('pane-died', 'run-shell -b "/moved/mesa hook tmux pane-died"');
  expect(await doctorRow('tmux hooks')).toMatchObject({
    status: 'warn',
    hint: 'not set on mesa-default: `mesa sessions` sets it on its next look at your sessions, `mesa open` with the next session',
  });
  await mesa('sessions');
  expect((await doctorRow('tmux hooks')).status).toBe('ok');

  const window = world.windows.find((w) => w.window === `claude-${id}`);
  if (window) window.dead = true;
  const died = await mesa('hook', 'tmux', 'pane-died', 'lantern-cove', `claude-${id}`, '--json');
  expect(died).toMatchObject({ code: 0 });
  expect(died.json.data).toEqual({ recorded: true, session: id });
  const [row] = (await mesa('sessions', '--json')).json.data;
  // Its exit is known at once, but it is not stopped: stop still cleans its window up.
  expect(row).toMatchObject({ lastState: { state: 'done', source: 'tmux-hook' } });
  expect(row.endedAt).toBeUndefined();
  // A window that is no session's is not an error.
  expect(await mesa('hook', 'tmux', 'pane-died', 'lantern-cove', 'zsh')).toMatchObject({ code: 0 });
});
