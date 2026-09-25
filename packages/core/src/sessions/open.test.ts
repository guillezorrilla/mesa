import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { listReceipts } from '../receipts.js';
import { scriptedRunner, tempDir, testDeps } from '../testing.js';

/**
 * claude and tmux as a scripted runner: `claude --version` answers (unless `claude` is false),
 * `has-session` finds a project's tmux session once a `new-session` made it, and the tmux
 * command named in `tmuxFails` fails.
 */
function fakeWorld(opts: { claude?: boolean; tmuxFails?: string } = {}) {
  const sessions = new Set<string>();
  const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1] ?? '';
  const failed = { ok: false as const, reason: 'failed' as const, detail: "can't find session" };
  return scriptedRunner(
    {
      claude: '2.1.282 (Claude Code)',
      tmux: (args) => {
        if (opts.tmuxFails && args.includes(opts.tmuxFails)) return failed;
        if (args.includes('has-session')) {
          return sessions.has(after(args, '-t').slice(1)) ? '' : failed;
        }
        if (args.includes('new-session')) sessions.add(after(args, '-s'));
        return '';
      },
    },
    { missing: opts.claude === false ? ['claude'] : [] },
  );
}

/** An initialised profile with its vault laid out and lantern-cove registered. */
async function setUp(world: ReturnType<typeof fakeWorld>, mesaYaml = 'name: lantern-cove\n') {
  const home = tempDir();
  const dir = join(home, 'src/lantern-cove');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mesa.yaml'), mesaYaml);
  const mesa = createMesa('default', testDeps(home, { run: world.run, argv: ['open'] }));
  mesa.init({ vault: 'vault' });
  mesa.vault.init();
  mesa.projects.register(dir);
  return { home, dir, mesa };
}

test('open starts claude with its session id in a new tmux session, then in a new window', async () => {
  const world = fakeWorld();
  const { home, dir, mesa } = await setUp(world);

  const { result: first, receipt } = await mesa.sessions.open('lantern-cove');
  expect(first).toMatchObject({
    kind: 'interactive',
    project: 'lantern-cove',
    agent: 'claude',
    agentSessionId: '00000000-0000-4000-8000-000000000001',
    tmux: { socket: 'mesa-default', session: 'lantern-cove', window: `claude-${first.id}` },
    lastState: { state: 'idle', source: 'mesa' },
  });
  const opened = world.calls.find((c) => c.args.includes('new-session'));
  expect(opened?.args).toEqual([
    '-L',
    'mesa-default',
    '-f',
    '/dev/null',
    'new-session',
    '-d',
    '-s',
    'lantern-cove',
    '-n',
    `claude-${first.id}`,
    '-c',
    dir,
    '-e',
    `MESA_SESSION_ID=${first.id}`,
    '-e',
    'MESA_PROFILE=default',
    'claude --session-id 00000000-0000-4000-8000-000000000001',
    // The tmux session does not keep the first window's ids for windows added by hand.
    ';',
    'set-environment',
    '-t',
    '=lantern-cove',
    '-u',
    'MESA_SESSION_ID',
    ';',
    'set-environment',
    '-t',
    '=lantern-cove',
    '-u',
    'MESA_PROFILE',
  ]);
  // The record is saved, and the session receipt names it.
  expect((await mesa.sessions.list()).map((s) => s.id)).toEqual([first.id]);
  const [entry] = listReceipts(join(home, 'vault'), 1);
  expect(entry?.receipt).toMatchObject({
    id: receipt?.id,
    type: 'session',
    status: 'ok',
    project: 'lantern-cove',
    session: first.id,
    agent: 'claude',
    outputs: { window: `claude-${first.id}`, agentSessionId: first.agentSessionId },
  });

  const { result: second } = await mesa.sessions.open('lantern-cove');
  const added = world.calls.find((c) => c.args.includes('new-window'))?.args;
  expect(added?.slice(4, 10)).toEqual([
    'new-window',
    '-d',
    '-t',
    '=lantern-cove:',
    '-n',
    `claude-${second.id}`,
  ]);
  expect(second.id).not.toBe(first.id);
});

test('the agent comes from the flag, else mesa.yaml, else the profile; v1 runs claude only', async () => {
  const world = fakeWorld();
  const { mesa } = await setUp(world, 'name: lantern-cove\nagent: codex\n');
  await expect(mesa.sessions.open('lantern-cove')).rejects.toMatchObject({
    code: 'agent_unavailable',
    message: 'codex support is planned in #43',
  });
  expect((await mesa.sessions.open('lantern-cove', 'claude')).result.agent).toBe('claude');
  await expect(mesa.sessions.open('lantern-cove', 'gpt')).rejects.toMatchObject({
    code: 'agent_unavailable',
    message: 'unknown agent gpt; agents are claude, codex',
  });

  const plain = await setUp(fakeWorld());
  plain.mesa.config.set('defaultAgent', 'codex');
  await expect(plain.mesa.sessions.open('lantern-cove')).rejects.toMatchObject({
    code: 'agent_unavailable',
  });
});

test('an unknown project, a missing claude, or a failed window leaves no session', async () => {
  const { mesa } = await setUp(fakeWorld());
  await expect(mesa.sessions.open('tide')).rejects.toMatchObject({
    code: 'not_found',
    message: 'no project named tide; see mesa projects',
  });

  const noClaude = await setUp(fakeWorld({ claude: false }));
  await expect(noClaude.mesa.sessions.open('lantern-cove')).rejects.toMatchObject({
    code: 'agent_unavailable',
    message: 'claude not found on PATH; install with `brew install --cask claude-code`',
  });
  expect(await noClaude.mesa.sessions.list()).toEqual([]);

  const broken = await setUp(fakeWorld({ tmuxFails: 'new-session' }));
  await expect(broken.mesa.sessions.open('lantern-cove')).rejects.toMatchObject({
    code: 'internal',
  });
  expect(await broken.mesa.sessions.list()).toEqual([]);
  const [entry] = listReceipts(join(broken.home, 'vault'), 1);
  expect(entry?.receipt).toMatchObject({ type: 'session', status: 'failed' });
});

test('a project whose folder is gone is not_found, even with --agent', async () => {
  const { dir, mesa } = await setUp(fakeWorld());
  rmSync(dir, { recursive: true });
  await expect(mesa.sessions.open('lantern-cove', 'claude')).rejects.toMatchObject({
    code: 'not_found',
  });
});

test('attachArgv attaches to the exact window on the profile socket', async () => {
  const { mesa } = await setUp(fakeWorld());
  const { result } = await mesa.sessions.open('lantern-cove');
  expect(mesa.sessions.attachArgv(result)).toEqual([
    'tmux',
    '-L',
    'mesa-default',
    '-f',
    '/dev/null',
    'attach-session',
    '-t',
    `=lantern-cove:=claude-${result.id}`,
    '-f',
    'ignore-size',
  ]);
});
