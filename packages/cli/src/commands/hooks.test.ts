import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  CLAUDE_VERSION,
  CODEX_VERSION,
  scriptedRunner,
  TEST_TYPESAFE_KEY,
} from '@mesa/core/testing';
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
  // An invented project hub: the pointer names the tools that read it, never its content.
  writeFileSync(join(cli.home, 'vault/projects/lantern-cove.md'), '# Lantern cove\nGREY KELP 19\n');
  cli.env = { MESA_SESSION_ID: opened.id, MESA_PROFILE: 'default' };
  cli.stdin = JSON.stringify({
    session_id: opened.agentSessionId,
    hook_event_name: 'SessionStart',
    source: 'startup',
  });
  const start = await mesa('hook', 'claude');
  expect(start.stdout).not.toContain('GREY KELP');
  expect(start.stdout).toContain(
    `Mesa session ${opened.id}; profile default; project lantern-cove;`,
  );
  expect(start.stdout).toContain(`mesa show ${opened.id} --json`);
  expect(start.stdout).toContain('invoked here as /skill-name');
  expect(start.stdout).toContain(
    'project_context, read_note, search_vault and session_goals on demand',
  );
  // On demand: no first step to promise (#558).
  expect(start.stdout).not.toMatch(/\bfirst\b/);
  expect(start.stdout).toContain('mesa vault context lantern-cove --json');
  expect(start.stdout).not.toContain('unavailable until P5');
  cli.stdin = JSON.stringify({ session_id: opened.agentSessionId, hook_event_name: 'Stop' });
  expect((await mesa('hook', 'claude')).stdout.trim()).toBe('');
  cli.stdin = JSON.stringify({ session_id: 'another-agent', hook_event_name: 'SessionStart' });
  expect((await mesa('hook', 'claude')).stdout.trim()).toBe('');
});

test('Antigravity PreInvocation gives only the owning native conversation a transient pointer', async () => {
  const world = cli.withTmux();
  await cli.withProject();
  cli.run = scriptedRunner({ tmux: world.answer, claude: CLAUDE_VERSION, agy: '1.2.13' }).run;
  const opened = (await mesa('open', 'lantern-cove', '--agent', 'antigravity', '--json')).json.data;
  expect((await mesa('show', opened.id, '--json')).json.data.instructions.state).toBe('missing');
  expect(
    (await mesa('doctor', '--json')).json.data.checks.find(
      (check: { name: string }) => check.name === 'antigravity hooks',
    ).status,
  ).toBe('warn');
  await mesa('hooks', 'install');
  expect((await mesa('show', opened.id, '--json')).json.data.instructions.state).toBe('configured');
  expect(
    (await mesa('doctor', '--json')).json.data.checks.find(
      (check: { name: string }) => check.name === 'antigravity hooks',
    ).status,
  ).toBe('ok');

  const nativeId = '002f58d1-9e29-4682-9bc1-3a2dc5da1115';
  writeFileSync(join(cli.paths.logs, `${opened.id}.agy.log`), `Created conversation ${nativeId}\n`);
  cli.env = { MESA_SESSION_ID: opened.id, MESA_PROFILE: 'default' };
  cli.stdin = JSON.stringify({ conversationId: nativeId, invocationNum: 0 });
  const injected = JSON.parse((await mesa('hook', 'antigravity')).stdout);
  expect(injected.injectSteps[0].ephemeralMessage).toContain(`Mesa session ${opened.id}`);
  expect(injected.injectSteps[0].ephemeralMessage).toContain('/skill-name');
  expect((await mesa('hook', 'antigravity', '--json')).json.data.delivered).toBe(true);
  expect(
    JSON.parse(readFileSync(join(cli.paths.sessions, `${opened.id}.json`), 'utf8')).agentSessionId,
  ).toBe(nativeId);
  const otherId = 'cd66cf01-f466-4c11-8f12-a8fd0885d9f4';
  writeFileSync(
    join(cli.paths.logs, `${opened.id}.agy.log`),
    `Created conversation ${nativeId}\nCreated conversation ${otherId}\n`,
  );
  cli.stdin = JSON.stringify({ conversationId: otherId, invocationNum: 0 });
  expect(JSON.parse((await mesa('hook', 'antigravity')).stdout)).toEqual({});
  expect((await mesa('show', opened.id, '--json')).json.data.instructions.state).toBe(
    'conflicting',
  );
  const fresh = (await mesa('open', 'lantern-cove', '--agent', 'antigravity', '--json')).json.data;
  const firstFreshId = '127e4772-a18d-4607-9281-e15457e0b024';
  const clearedFreshId = '22014be8-4479-4b5b-922a-d5335fccb551';
  writeFileSync(
    join(cli.paths.logs, `${fresh.id}.agy.log`),
    `Created conversation ${firstFreshId}\nCreated conversation ${clearedFreshId}\n`,
  );
  cli.env.MESA_SESSION_ID = fresh.id;
  cli.stdin = JSON.stringify({ conversationId: clearedFreshId, invocationNum: 0 });
  expect(JSON.parse((await mesa('hook', 'antigravity')).stdout)).toEqual({});
  expect((await mesa('show', fresh.id, '--json')).json.data).toMatchObject({
    agentSessionId: firstFreshId,
    instructions: { state: 'conflicting' },
  });
  cli.env.MESA_PROFILE = 'another-profile';
  expect(JSON.parse((await mesa('hook', 'antigravity')).stdout)).toEqual({});
  cli.stdin = '{';
  expect(JSON.parse((await mesa('hook', 'antigravity')).stdout)).toEqual({});
});

test('show reports each mount; hooks manage Antigravity mesa-vault and mesa-decisions beside a user server and rule', async () => {
  const world = cli.withTmux();
  await cli.withProject();
  cli.run = scriptedRunner({
    tmux: world.answer,
    claude: CLAUDE_VERSION,
    codex: CODEX_VERSION,
    agy: '1.2.13',
  }).run;
  const open = async (...args: string[]) =>
    (await mesa('open', 'lantern-cove', ...args, '--json')).json.data;
  const vault = async (id: string) => (await mesa('show', id, '--json')).json.data.vault;
  const doctor = async () =>
    (await mesa('doctor', '--json')).json.data.checks.find(
      (check: { name: string }) => check.name === 'antigravity vault',
    );
  const configured = { state: 'configured', reason: 'mesa-vault is mounted in its launch command' };
  expect(await vault((await open()).id)).toEqual(configured);
  expect(await vault((await open('--agent', 'codex')).id)).toEqual(configured);
  expect((await vault((await open('--terminal')).id)).state).toBe('unsupported');
  const agy = await open('--agent', 'antigravity');
  expect(await vault(agy.id)).toEqual({ state: 'missing', reason: 'Run mesa hooks install' });
  expect((await doctor()).status).toBe('warn');

  // An invented server and rule of the user's, which install and uninstall leave byte for byte.
  const mcpFile = join(cli.home, '.gemini/config/mcp_config.json');
  const rulesFile = join(cli.home, '.gemini/antigravity-cli/settings.json');
  const mcp = `${JSON.stringify({ mcpServers: { tide: { command: 'node', args: ['/opt/tide.js'] } } }, null, 2)}\n`;
  const rules = `${JSON.stringify({ permissions: { allow: ['command(git)'] } }, null, 2)}\n`;
  mkdirSync(dirname(mcpFile), { recursive: true });
  mkdirSync(dirname(rulesFile), { recursive: true });
  writeFileSync(mcpFile, mcp);
  writeFileSync(rulesFile, rules);
  expect((await mesa('hooks', 'install', '--json')).json.data.antigravityVault).toMatchObject({
    path: mcpFile,
    rulePath: rulesFile,
    installed: true,
    changed: true,
  });
  expect(JSON.parse(readFileSync(mcpFile, 'utf8')).mcpServers).toEqual({
    tide: { command: 'node', args: ['/opt/tide.js'] },
    'mesa-vault': { command: '/usr/local/bin/mesa', args: ['vault', 'mcp'] },
    'mesa-decisions': { command: '/usr/local/bin/mesa', args: ['decisions', 'mcp'] },
  });
  expect(JSON.parse(readFileSync(rulesFile, 'utf8')).permissions.allow).toEqual([
    'command(git)',
    'mcp(mesa-vault/*)',
    'mcp(mesa-decisions/*)',
  ]);
  expect(await vault(agy.id)).toEqual({
    state: 'configured',
    reason: 'Global mesa-vault entry and allow rule are configured',
  });
  expect((await mesa('hooks', 'status')).stdout).toContain(
    `${mcpFile}\nok   mesa-vault entry\n${rulesFile}\nok   mesa-vault allow rule\n${mcpFile}\nok   mesa-decisions entry\n${rulesFile}\nok   mesa-decisions allow rule\n`,
  );
  expect((await doctor()).status).toBe('ok');

  expect((await mesa('hooks', 'uninstall', '--json')).json.data.antigravityVault).toMatchObject({
    installed: false,
    changed: true,
  });
  expect(readFileSync(mcpFile, 'utf8')).toBe(mcp);
  expect(readFileSync(rulesFile, 'utf8')).toBe(rules);
  expect((await vault(agy.id)).state).toBe('missing');

  // A server of the user's under Mesa's name is reported, never taken over.
  const foreign = `${JSON.stringify({ mcpServers: { 'mesa-vault': { command: 'node', args: ['/opt/other.js'] } } })}\n`;
  writeFileSync(mcpFile, foreign);
  expect(await vault(agy.id)).toEqual({
    state: 'conflicting',
    reason: `${mcpFile}: mesa-vault belongs to another server; Mesa left it unchanged`,
  });
  expect((await mesa('hooks', 'install')).code).toBe(0);
  expect(readFileSync(mcpFile, 'utf8')).toBe(foreign);
  expect(readFileSync(rulesFile, 'utf8')).toBe(rules);
  // So is one under mesa-decisions: both files stay as they were, and uninstall takes nothing.
  const theirs = `${JSON.stringify({ mcpServers: { 'mesa-decisions': { command: 'node', args: ['/opt/advisor.js'] } } })}\n`;
  writeFileSync(mcpFile, theirs);
  const installed = (await mesa('hooks', 'install', '--json')).json.data;
  expect(installed.antigravityDecisions.conflict).toBe(
    `${mcpFile}: mesa-decisions belongs to another server; Mesa left it unchanged`,
  );
  expect(installed.warning).toBe(installed.antigravityDecisions.conflict);
  expect((await mesa('hooks', 'uninstall')).code).toBe(0);
  expect(readFileSync(mcpFile, 'utf8')).toBe(theirs);
  expect(readFileSync(rulesFile, 'utf8')).toBe(rules);
});

test('a malformed Antigravity file is that part conflicting; the other hooks carry on', async () => {
  await mesa('init', '--vault', 'vault');
  const mcpFile = join(cli.home, '.gemini/config/mcp_config.json');
  mkdirSync(dirname(mcpFile), { recursive: true });
  writeFileSync(mcpFile, '{broken');
  const conflict = `${mcpFile}: not valid JSON; fix it before Mesa edits it`;

  const status = await mesa('hooks', 'status', '--json');
  expect(status.code).toBe(0);
  expect(status.json.data.antigravityVault).toMatchObject({ installed: false, conflict });
  expect((await mesa('hooks', 'status')).stdout).toContain(`${mcpFile}\nCONFLICT ${conflict}\n`);

  const installed = await mesa('hooks', 'install', '--json');
  expect(installed.code).toBe(0);
  expect(installed.json.data).toMatchObject({
    installed: true,
    changed: true,
    codex: { installed: true },
    antigravity: { installed: true },
    antigravityVault: { changed: false, conflict },
    warning: conflict,
  });
  expect(readFileSync(mcpFile, 'utf8')).toBe('{broken');
  expect(existsSync(join(cli.home, '.gemini/antigravity-cli/settings.json'))).toBe(false);
  const check = (await mesa('doctor', '--json')).json.data.checks.find(
    (c: { name: string }) => c.name === 'antigravity vault',
  );
  expect(check).toMatchObject({ status: 'warn', hint: conflict });

  const removed = await mesa('hooks', 'uninstall', '--json');
  expect(removed.code).toBe(0);
  expect(removed.json.data).toMatchObject({ installed: false, antigravityVault: { conflict } });
  expect(readFileSync(mcpFile, 'utf8')).toBe('{broken');
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
  expect(start.stdout).toContain('Without the tools: mesa vault context --general --json');
});

test.each([true, false])(
  'Codex clear retains identity and reports conflict, end first: %s',
  async (endFirst) => {
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
    if (endFirst) {
      cli.stdin = JSON.stringify({
        session_id: opened.agentSessionId ?? 'native-one',
        hook_event_name: 'SessionEnd',
      });
      await mesa('hook', 'codex');
    }
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
  },
);

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

test.each(['startup', undefined])(
  'an unknown Codex native start reports ambiguity without a pointer: %s',
  async (source) => {
    cli.withTmux();
    await cli.withProject();
    const opened = (await mesa('open', 'lantern-cove', '--agent', 'codex', '--json')).json.data;
    cli.env = { MESA_SESSION_ID: opened.id, MESA_PROFILE: 'default' };
    cli.stdin = JSON.stringify({
      session_id: 'native-one',
      hook_event_name: 'SessionStart',
      source: 'startup',
    });
    await mesa('hook', 'codex');
    cli.stdin = JSON.stringify({
      session_id: 'unknown-native',
      hook_event_name: 'SessionStart',
      source,
    });
    expect((await mesa('hook', 'codex')).stdout.trim()).toBe('');
    const shown = (await mesa('show', opened.id, '--json')).json.data;
    expect(shown.agentSessionId).toBe('native-one');
    expect(shown.instructions).toMatchObject({
      state: 'conflicting',
      reason: expect.stringContaining('/clear or nested Codex is ambiguous'),
    });
  },
);

test('with a Decision model a session mounts mesa-decisions, a prompt gets advice, and show tells configured from observed', async () => {
  await cli.withDecisionModels();
  const tmux = cli.withTmux();
  const note = join(cli.home, 'vault/wiki/decisions/retry-policy.md');
  mkdirSync(dirname(note), { recursive: true });
  writeFileSync(
    note,
    '---\nproject: lantern-cove\ntype: decision\n---\n# Retry policy\n\nFeed calls retry 5 times on 503 (AMBER TIDE 7).\n',
  );
  const open = async () =>
    (await mesa('open', 'lantern-cove', '--goal', 'Make the feed import retry', '--json')).json
      .data;
  const show = async (id: string) => (await mesa('show', id, '--json')).json.data;
  const launch = (id: string) => tmux.windows.find((w) => w.window.endsWith(id))?.launch ?? '';
  // No key: nothing of mesa-decisions is mounted, and show says why.
  const before = await open();
  expect(launch(before.id)).not.toContain('mesa-decisions');
  expect(launch(before.id)).not.toContain('decisions prepare');
  expect((await show(before.id)).decisions.tool).toEqual({
    state: 'disabled',
    reason: 'no decision model: add a key with mesa decisions key set',
  });
  cli.stdin = TEST_TYPESAFE_KEY;
  await mesa('decisions', 'key', 'set', 'typesafe');
  // A session started before the key cannot gain the tool: show says how, never enabled.
  expect((await show(before.id)).decisions.tool).toEqual({
    state: 'missing',
    reason: 'Started without mesa-decisions; stop it and resume through Mesa to mount it',
    action: 'restart',
  });
  const opened = await open();
  expect(launch(opened.id)).toContain('"mesa-decisions":{"type":"stdio"');
  expect(launch(opened.id)).toContain('--allowedTools=mcp__mesa-vault,mcp__mesa-decisions');
  expect(launch(opened.id)).toMatch(/^\('\/usr\/local\/bin\/mesa' decisions prepare .*&\); /);
  expect(launch(opened.id)).toContain("'Make the feed import retry'");
  await mesa('hooks', 'install');
  expect((await show(opened.id)).decisions).toEqual({
    tool: { state: 'configured', reason: 'mesa-decisions is mounted in its launch command' },
    advice: { state: 'configured', reason: 'UserPromptSubmit adds advice to the turn' },
  });

  // Inside the window: the prompt's hook prints additionalContext JSON, for its own conversation.
  cli.env = { MESA_SESSION_ID: opened.id, MESA_PROFILE: 'default' };
  cli.stdin = JSON.stringify({
    session_id: opened.agentSessionId,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Make the feed import retry',
  });
  const hook = await mesa('hook', 'claude');
  const context = JSON.parse(hook.stdout).hookSpecificOutput;
  expect(context.hookEventName).toBe('UserPromptSubmit');
  expect(context.additionalContext).toContain('AMBER TIDE 7');
  expect((await mesa('hook', 'claude', '--json')).json.data).toEqual({
    recorded: true,
    event: 'UserPromptSubmit',
    advised: true,
  });
  cli.stdin = JSON.stringify({
    session_id: 'a-nested-claude',
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Make the feed import retry',
  });
  expect((await mesa('hook', 'claude')).stdout.trim()).toBe('');
  cli.env = {};
  const observed = (await show(opened.id)).decisions;
  expect(observed.advice.observedAt).toBe('2026-09-24T12:00:00.000Z');
  expect(observed.tool.observedAt).toBeUndefined();

  // Turned off for the session: disabled, whatever is configured.
  await mesa('decisions', 'off', '--session', opened.id);
  expect((await show(opened.id)).decisions.advice.state).toBe('disabled');
});
