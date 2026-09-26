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
async function setUp(
  world: ReturnType<typeof fakeWorld>,
  mesaYaml = 'name: lantern-cove\n',
  argv = ['open'],
) {
  const home = tempDir();
  const dir = join(home, 'src/lantern-cove');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mesa.yaml'), mesaYaml);
  const mesa = createMesa('default', testDeps(home, { run: world.run, argv }));
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
  expect((await mesa.sessions.open('lantern-cove', { agent: 'claude' })).result.agent).toBe(
    'claude',
  );
  await expect(mesa.sessions.open('lantern-cove', { agent: 'gpt' })).rejects.toMatchObject({
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
  await expect(mesa.sessions.open('lantern-cove', { agent: 'claude' })).rejects.toMatchObject({
    code: 'not_found',
  });
});

test('an open session attaches to its exact window on the profile socket', async () => {
  const { mesa } = await setUp(fakeWorld());
  const { result } = await mesa.sessions.open('lantern-cove');
  expect((await mesa.sessions.attach(result.id)).exec).toEqual([
    'tmux',
    '-L',
    'mesa-default',
    '-f',
    '/dev/null',
    // Its own view of the project's session, so other terminals keep their windows.
    'new-session',
    '-t',
    '=lantern-cove',
    '-s',
    expect.stringMatching(/^_view-[0-9a-z]{8}$/),
    ';',
    'set-option',
    'destroy-unattached',
    'on',
    ';',
    'select-window',
    '-t',
    expect.stringMatching(new RegExp(`^=_view-[0-9a-z]{8}:=claude-${result.id}$`)),
  ]);
});

/** The command the window runs: the word after the window's -e variables. */
const launched = (world: ReturnType<typeof fakeWorld>) => {
  const args = world.calls.filter((c) => c.args.includes('-n')).at(-1)?.args ?? [];
  return args[args.indexOf('MESA_PROFILE=default') + 1];
};

test('a goal is the first prompt: one shell word after the session id, kept on the record', async () => {
  const world = fakeWorld();
  const { mesa } = await setUp(world);
  const goal = `/goal Print "ready" in $HOME, then 'stop'`;
  const { result } = await mesa.sessions.open('lantern-cove', { goal });
  expect(launched(world)).toBe(
    // Single quotes keep $HOME and the double quotes literal; each ' becomes '\''.
    String.raw`claude --session-id 00000000-0000-4000-8000-000000000001 '/goal Print "ready" in $HOME, then '\''stop'\'''`,
  );
  expect(result.goal).toBe(goal);
  expect(mesa.sessions.goal(result.id)).toEqual({ id: result.id, goal });

  const { result: plain } = await mesa.sessions.open('lantern-cove');
  expect(launched(world)).toBe('claude --session-id 00000000-0000-4000-8000-000000000002');
  expect(() => mesa.sessions.goal(plain.id)).toThrow(
    expect.objectContaining({ code: 'not_found', message: `session ${plain.id} has no goal` }),
  );
});

test('the receipt keeps the goal first 80 characters, in its command line too', async () => {
  const goal = `Write the release notes for ${'v1.2.3, '.repeat(12)}then stop`;
  const { home, mesa } = await setUp(fakeWorld(), undefined, [
    'open',
    'lantern-cove',
    `--goal=${goal}`,
  ]);
  await mesa.sessions.open('lantern-cove', { goal });
  const [entry] = listReceipts(join(home, 'vault'), 1);
  const short = goal.slice(0, 80);
  expect(entry?.receipt.inputs).toEqual({ project: 'lantern-cove', agent: null, goal: short });
  expect(entry?.receipt.command).toBe(
    `mesa open lantern-cove ${JSON.stringify(`--goal=${short}`)}`,
  );
});

test('a goal file is read byte for byte; a bad goal is refused and leaves no session', async () => {
  const world = fakeWorld();
  const { home, mesa } = await setUp(world);
  const file = join(home, 'goal.md');
  writeFileSync(file, '/goal Keep going until `pnpm verify` is green.\nThen stop.\n');
  const { result } = await mesa.sessions.open('lantern-cove', { goalFile: file });
  expect(result.goal).toBe('/goal Keep going until `pnpm verify` is green.\nThen stop.\n');

  const refused = async (opts: object, code: string, message: string) => {
    await expect(mesa.sessions.open('lantern-cove', opts)).rejects.toMatchObject({ code, message });
  };
  await refused(
    { goalFile: join(home, 'nope.md') },
    'not_found',
    `no goal file at ${join(home, 'nope.md')}`,
  );
  await refused({ goal: 'x', goalFile: file }, 'usage', 'pass --goal or --goal-file, not both');
  await refused({ goal: '' }, 'usage', 'the goal is empty');
  await refused(
    { goal: '--help' },
    'usage',
    'a goal cannot start with -: claude would read it as a flag',
  );
  await refused(
    { goal: 'x'.repeat(12_000) },
    'usage',
    'the goal is 12002 bytes quoted, over the 12000 a tmux command holds: put it in a file and make the goal point to that file',
  );
  expect((await mesa.sessions.list()).map((s) => s.id)).toEqual([result.id]);
});

test('resume keeps the goal on the new record but does not send it again', async () => {
  const world = fakeWorld();
  const { mesa } = await setUp(world);
  const { result: first } = await mesa.sessions.open('lantern-cove', { goal: 'Print ready' });
  const { result } = await mesa.sessions.resume(first.id);
  expect(launched(world)).toBe(`claude --resume ${first.agentSessionId}`);
  expect(result.record.goal).toBe('Print ready');
});
