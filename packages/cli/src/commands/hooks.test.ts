import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
  expect((await mesa('hooks', 'install')).stdout).toContain(
    'hooks already installed\nThe next Codex start',
  );

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
  const log = readFileSync(join(cli.paths.events, 'aaaaaaaa.jsonl'), 'utf8');
  expect(JSON.parse(log)).toMatchObject({
    agent: 'claude',
    event: 'Stop',
    agentSessionId: 'uuid-1',
  });
  expect((await mesa('hook', 'codex', '--json')).json.data.recorded).toBe(false);

  cli.env = {};
  expect((await mesa('hooks', 'uninstall', '--json')).json.data).toMatchObject({
    installed: false,
    changed: true,
  });
  expect(readFileSync(join(cli.home, '.claude/settings.json'), 'utf8')).toBe('{}\n');
});

test('SessionStart gives only the owning native session a bounded Mesa pointer', async () => {
  cli.withTmux();
  await cli.withProject();
  const opened = (await mesa('open', 'lantern-cove', '--json')).json.data;
  expect((await mesa('show', opened.id, '--json')).json.data.instructions.state).toBe('missing');
  await mesa('hooks', 'install');
  expect((await mesa('show', opened.id, '--json')).json.data.instructions.state).toBe('configured');
  cli.env = { MESA_SESSION_ID: opened.id, MESA_PROFILE: 'default' };
  cli.stdin = JSON.stringify({
    session_id: opened.agentSessionId,
    hook_event_name: 'SessionStart',
    source: 'startup',
  });
  const start = await mesa('hook', 'claude');
  expect(start.stdout).toContain(
    `Mesa session ${opened.id}; profile default; project lantern-cove;`,
  );
  expect(start.stdout).toContain(`mesa show ${opened.id} --json`);
  expect(start.stdout).toContain('Invoke skills in this terminal with /skill-name');
  cli.stdin = JSON.stringify({ session_id: opened.agentSessionId, hook_event_name: 'Stop' });
  expect((await mesa('hook', 'claude')).stdout.trim()).toBe('');
  cli.stdin = JSON.stringify({ session_id: 'another-agent', hook_event_name: 'SessionStart' });
  expect((await mesa('hook', 'claude')).stdout.trim()).toBe('');
});

test('General SessionStart points at profile skills without an unregistered project', async () => {
  cli.withTmux();
  await mesa('init', '--vault', 'vault');
  const opened = (await mesa('open', '--general', '--agent', 'codex', '--json')).json.data;
  cli.env = { MESA_SESSION_ID: opened.id, MESA_PROFILE: 'default' };
  cli.stdin = JSON.stringify({
    session_id: opened.agentSessionId ?? 'native-codex-id',
    hook_event_name: 'SessionStart',
  });
  const start = await mesa('hook', 'codex');
  expect(start.stdout).toContain('mesa skills list --json');
  expect(start.stdout).not.toContain('mesa skills list __mesa_general__');
});

test('Codex clear leaves its saved identity intact and show reports the lost pointer', async () => {
  cli.withTmux();
  await cli.withProject();
  const opened = (await mesa('open', 'lantern-cove', '--agent', 'codex', '--json')).json.data;
  await mesa('hooks', 'install');
  cli.env = { MESA_SESSION_ID: opened.id, MESA_PROFILE: 'default' };
  cli.stdin = JSON.stringify({
    session_id: opened.agentSessionId ?? 'native-one',
    hook_event_name: 'SessionStart',
    source: 'startup',
  });
  await mesa('hook', 'codex');
  cli.stdin = JSON.stringify({
    session_id: opened.agentSessionId ?? 'native-one',
    hook_event_name: 'SessionEnd',
  });
  await mesa('hook', 'codex');
  cli.stdin = JSON.stringify({
    session_id: 'native-after-clear',
    hook_event_name: 'SessionStart',
    source: 'clear',
  });
  const changed = await mesa('hook', 'codex', '--json');
  expect(changed.json.data).toMatchObject({
    recorded: true,
    event: 'SessionIdentityChanged',
  });
  expect((await mesa('show', opened.id, '--json')).json.data).toMatchObject({
    agentSessionId: opened.agentSessionId ?? 'native-one',
    instructions: {
      state: 'conflicting',
      reason: 'Native conversation changed after /clear; reopen through Mesa',
    },
  });
});

test('a hook in a session refuses to log while config.yaml does not read, so no key leaks', async () => {
  await mesa('init', '--vault', 'vault');
  await mesa('config', 'set', 'keys.api', 'sk-live-1234');
  const events = join(cli.paths.events, 'aaaaaaaa.jsonl');
  cli.stdin = JSON.stringify({ hook_event_name: 'Stop', prompt: 'my key is sk-live-1234' });
  cli.env = { MESA_SESSION_ID: 'aaaaaaaa' };
  await mesa('hook', 'claude');
  expect(readFileSync(events, 'utf8')).not.toContain('sk-live-1234');

  const config = cli.paths.config;
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
  const world = cli.withTmux();
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

test('after a /clear, mesa sessions shows the new agent session id, not done, and its hooks log on', async () => {
  cli.withTmux();
  await cli.withProject();
  const opened = (await mesa('open', 'lantern-cove', '--json')).json.data;
  const hook = (payload: object) => {
    cli.stdin = JSON.stringify(payload);
    return mesa('hook', 'claude', '--json');
  };
  cli.env = { MESA_SESSION_ID: opened.id, MESA_PROFILE: 'default' };
  const after = '11111111-2222-4333-8444-555555555555';
  await hook({ session_id: opened.agentSessionId, hook_event_name: 'SessionEnd', reason: 'clear' });
  await hook({ session_id: after, hook_event_name: 'SessionStart', source: 'clear' });
  expect((await hook({ session_id: after, hook_event_name: 'Stop' })).json.data).toEqual({
    recorded: true,
    event: 'Stop',
  });
  expect((await hook({ session_id: 'a-third-id', hook_event_name: 'Stop' })).json.data).toEqual({
    recorded: false,
    event: null,
  });
  cli.env = {};
  const [row] = (await mesa('sessions', '--json')).json.data;
  expect(row).toMatchObject({ id: opened.id, agentSessionId: after, lastState: { state: 'idle' } });
  const events = readFileSync(join(cli.paths.events, `${opened.id}.jsonl`), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l).event);
  expect(events).toEqual(['SessionEnd', 'SessionStart', 'Stop']);
});

test('Codex hooks flow through CLI JSON, doctor trust rows, and board state', async () => {
  cli.withTmux();
  await cli.withProject();
  const installed = (await mesa('hooks', 'install', '--json')).json.data.codex;
  expect(installed.installed).toBe(true);
  expect(Object.values(installed.trusted)).toEqual(Array(9).fill(false));
  expect((await mesa('hooks', 'status')).stdout).toContain('UNTRUSTED SessionStart');
  const findings = (await mesa('doctor', '--json')).json.data.checks.filter((c: { name: string }) =>
    c.name.startsWith('codex hooks '),
  );
  expect(findings).toHaveLength(9);
  expect(
    findings.every(
      (c: { status: string; hint: string }) =>
        c.status === 'warn' && c.hint.includes('Hooks need review'),
    ),
  ).toBe(true);
  const id = (await mesa('open', 'lantern-cove', '--agent', 'codex', '--json')).json.data.id;
  expect((await mesa('show', id, '--json')).json.data.instructions.state).toBe('conflicting');
  cli.env = { ...cli.env, MESA_SESSION_ID: id, MESA_PROFILE: 'default' };
  for (const [event, state] of [
    ['SessionStart', 'idle'],
    ['PermissionRequest', 'waiting-permission'],
    ['Interrupt', 'idle'],
    ['SessionEnd', 'done'],
  ]) {
    cli.stdin = JSON.stringify({
      session_id: 'invented-thread',
      hook_event_name: event,
      reason: 'clear',
    });
    expect((await mesa('hook', 'codex', '--json')).json.data).toEqual({ recorded: true, event });
    const row = (await mesa('sessions', '--json')).json.data.find(
      (s: { id: string }) => s.id === id,
    );
    expect(row).toMatchObject({
      agentSessionId: 'invented-thread',
      lastState: { state, source: 'hook', confidence: 0.95 },
    });
  }
  const config = join(installed.path, '..', 'config.toml');
  writeFileSync(
    config,
    `[hooks.state.${JSON.stringify(`${installed.path}:session_start:0:0`)}]\ntrusted_hash = "sha256:invented"\n`,
  );
  const trusted = (await mesa('doctor', '--json')).json.data.checks.find(
    (c: { name: string }) => c.name === 'codex hooks SessionStart',
  );
  expect(trusted.status).toBe('ok');
});

test('Codex SessionEnd starts the queue of the payload-matched session', async () => {
  cli.withTmux();
  await cli.withProject();
  const a = (await mesa('open', 'lantern-cove', '--agent', 'codex', '--json')).json.data;
  const b = (await mesa('open', 'lantern-cove', '--agent', 'codex', '--json')).json.data;
  const queued = (await mesa('open', 'lantern-cove', '--after', a.id, '--json')).json.data;
  cli.env = { ...cli.env, MESA_SESSION_ID: a.id, MESA_PROFILE: 'default' };
  cli.stdin = JSON.stringify({ session_id: 'thread-a', hook_event_name: 'SessionStart' });
  await mesa('hook', 'codex');
  cli.env.MESA_SESSION_ID = b.id;
  cli.stdin = JSON.stringify({
    session_id: 'thread-a',
    hook_event_name: 'SessionEnd',
    reason: 'resume',
  });
  expect((await mesa('hook', 'codex', '--json')).json.data.recorded).toBe(true);
  const record = JSON.parse(readFileSync(join(cli.paths.sessions, `${queued.id}.json`), 'utf8'));
  expect(record.lastState.state).toBe('idle');
  expect(record.pending).toBeUndefined();
});

test('broken Codex trust is a doctor warning and prevents a partial hooks install', async () => {
  await mesa('init', '--vault', 'vault');
  const codex = (await mesa('hooks', 'status', '--json')).json.data.codex;
  mkdirSync(join(codex.path, '..'), { recursive: true });
  writeFileSync(join(codex.path, '..', 'config.toml'), 'secret = "invented-secret"broken');
  expect(await mesa('hooks', 'install', '--json')).toMatchObject({ code: 4 });
  expect(existsSync(join(cli.home, '.claude/settings.json'))).toBe(false);
  expect(existsSync(codex.path)).toBe(false);
  const report = (await mesa('doctor', '--json')).json.data;
  expect(report.checks.find((c: { name: string }) => c.name === 'codex hooks')).toMatchObject({
    status: 'warn',
  });
  expect(JSON.stringify(report)).not.toContain('invented-secret');
});
