import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { Env, Runner } from '../lib/process.js';
import { createMesa } from '../mesa.js';
import { listReceipts } from '../receipts/store.js';
import {
  agentWorld,
  CLAUDE_MOUNT,
  CODEX_MOUNT,
  gitProject,
  gitRepo,
  isolateGit,
  profilePaths,
  projectProfile,
  sequentialIds,
  tempDir,
  testDeps,
  testGit,
  withRealGit,
  worktreeAt,
} from '../testing/index.js';
import { GENERAL_PROJECT } from './general.js';

/** Every agent in the fake tmux exits, its pane dead, as a session's must before it resumes. */
const exitAll = (world: ReturnType<typeof agentWorld>) => {
  for (const w of world.tmux.windows) w.dead = true;
};

// One id source for the file, so a second mesa over the same home never reuses an id.
const newId = sequentialIds();

isolateGit({ beforeAll, afterAll });

/** The real git, over the temp repositories; the rest stays scripted. */
const withGit = (world: ReturnType<typeof agentWorld>): Runner => withRealGit(world.run);

/** An initialised profile with its vault laid out and lantern-cove registered. */
async function setUp(
  world: ReturnType<typeof agentWorld>,
  {
    mesaYaml = 'name: lantern-cove\n',
    argv = ['open'],
    run = withGit(world),
    linkedHome = false,
    env,
  }: { mesaYaml?: string; argv?: string[]; run?: Runner; linkedHome?: boolean; env?: Env } = {},
) {
  // A home reached through a symlink, as the paths Mesa builds are then not the real ones.
  const home = linkedHome ? join(tempDir(), 'home') : tempDir();
  if (linkedHome) symlinkSync(tempDir(), home);
  return projectProfile(run, { home, mesaYaml, argv, newId, ...(env ? { env } : {}) });
}

test('open starts claude with its session id in a new tmux session, then in a new window', async () => {
  const world = agentWorld();
  const { home, dir, mesa } = await setUp(world, { env: { NO_COLOR: '1' } });

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
    '-u',
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
    '/usr/bin/env',
    '-C',
    dir,
    // Through /bin/sh, never the user's shell, which may quote otherwise (fish, tcsh).
    '/bin/sh',
    '-c',
    `unset NO_COLOR; exec claude --session-id 00000000-0000-4000-8000-000000000001 ${CLAUDE_MOUNT}`,
    // Its output log, from the first byte: the pipe starts in the same call.
    ';',
    'pipe-pane',
    '-o',
    '-t',
    `=lantern-cove:=claude-${first.id}`,
    `cat >> '${join(profilePaths(home, 'default').logs, `${first.id}.log`)}'`,
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
  // The local record is saved without adding routine history to the vault.
  expect((await mesa.sessions.list()).map((s) => s.id)).toEqual([first.id]);
  expect(receipt).toBeNull();
  expect(listReceipts(join(home, 'vault'))).toEqual([]);

  const { result: second } = await mesa.sessions.open('lantern-cove');
  const added = world.calls.find((c) => c.args.includes('new-window'))?.args;
  expect(added?.slice(5, 11)).toEqual([
    'new-window',
    '-d',
    '-t',
    '=lantern-cove:',
    '-n',
    `claude-${second.id}`,
  ]);
  expect(second.id).not.toBe(first.id);
});

test('General opens in the profile home without project skills, and can resume or open a plain terminal', async () => {
  const world = agentWorld();
  const { home, mesa } = await setUp(world);
  const { result: first } = await mesa.sessions.open(undefined, { general: true });
  expect(first).toMatchObject({ project: GENERAL_PROJECT, cwd: home, agent: 'claude' });
  expect(first.tmux.session).toBe(GENERAL_PROJECT);
  expect(world.tmux.windows[0]).toMatchObject({ project: GENERAL_PROJECT });
  const started = world.calls.find((call) => call.args.includes('new-session'))?.args ?? [];
  expect(started.slice(started.indexOf('-c'), started.indexOf('-c') + 2)).toEqual(['-c', home]);
  expect(existsSync(join(home, '.claude/skills/mesa/SKILL.md'))).toBe(false);
  expect((await mesa.sessions.list()).find((row) => row.id === first.id)?.project).toBe(
    GENERAL_PROJECT,
  );

  exitAll(world);
  const resumed = (await mesa.sessions.resume(first.id)).result;
  expect(resumed.record).toMatchObject({
    project: GENERAL_PROJECT,
    cwd: home,
    resumedFrom: first.id,
  });
  const terminal = (await mesa.sessions.open(undefined, { general: true, terminal: true })).result;
  expect(terminal).toMatchObject({
    project: GENERAL_PROJECT,
    cwd: home,
    kind: 'terminal',
    agent: 'terminal',
  });
  expect(terminal.agentSessionId).toBeUndefined();
  await expect(mesa.sessions.open(undefined)).rejects.toMatchObject({ code: 'usage' });
  await expect(mesa.sessions.open('lantern-cove', { general: true })).rejects.toMatchObject({
    code: 'usage',
  });
  await expect(
    mesa.sessions.open(undefined, { general: true, branch: 'branch' }),
  ).rejects.toMatchObject({ code: 'usage' });
});

test('Plan starts in the provider native mode and survives resume; unsupported agents are refused', async () => {
  const world = agentWorld();
  const { mesa } = await setUp(world);
  const claude = (await mesa.sessions.open('lantern-cove', { mode: 'plan' })).result;
  expect(claude.mode).toBe('plan');
  expect(world.tmux.windows.at(-1)?.launch).toContain(' --permission-mode plan');

  const antigravity = (
    await mesa.sessions.open('lantern-cove', { agent: 'antigravity', mode: 'plan' })
  ).result;
  expect(antigravity.mode).toBe('plan');
  expect(world.tmux.windows.at(-1)?.launch).toContain(' --mode=plan');
  await expect(
    mesa.sessions.open('lantern-cove', { agent: 'codex', mode: 'plan' }),
  ).rejects.toMatchObject({ code: 'usage' });
  await expect(
    mesa.sessions.open('lantern-cove', { terminal: true, mode: 'plan' }),
  ).rejects.toMatchObject({ code: 'usage' });
  await expect(mesa.sessions.open('lantern-cove', { mode: 'fast' })).rejects.toMatchObject({
    code: 'usage',
  });

  exitAll(world);
  const resumed = (await mesa.sessions.resume(claude.id)).result.record;
  expect(resumed.mode).toBe('plan');
  expect(world.tmux.windows.at(-1)?.launch).toContain(' --permission-mode plan');
});

test('Claude background keeps its native process when the terminal closes, then stops and resumes it', async () => {
  const world = agentWorld();
  const base = withGit(world);
  let native = 'active';
  let launchEnv: Env | undefined;
  let launchArgs: readonly string[] = [];
  const run: Runner = (file, args, ms, options) => {
    if (file === 'claude' && args[0] === '--bg') {
      launchEnv = options?.env;
      launchArgs = args;
      return Promise.resolve({ ok: true, stdout: 'backgrounded · abcdef12\n' });
    }
    if (file === 'claude' && args[0] === 'stop') {
      expect(args).toEqual(['stop', 'abcdef12']);
      native = 'stopped';
      return Promise.resolve({ ok: true, stdout: 'stopped abcdef12\n' });
    }
    if (file === 'claude' && args[0] === 'agents') {
      return Promise.resolve({
        ok: true,
        stdout: JSON.stringify([
          {
            id: 'abcdef12',
            kind: 'background',
            cwd: options?.cwd ?? '',
            sessionId: 'abcdef12-0000-4000-8000-000000000001',
            startedAt: 1790251200000,
            ...(native === 'stopped'
              ? { state: 'stopped' }
              : { pid: 1234, status: 'idle', state: 'done' }),
          },
        ]),
      });
    }
    return base(file, args, ms, options);
  };
  // Opened from inside another Mesa window, whose variables must not reach Claude's supervisor.
  const env = { CLAUDECODE: '1', NO_COLOR: '1', MESA_SESSION_ID: 'zzzzzzzz', MESA_PROFILE: 'work' };
  const { mesa } = await setUp(world, { run, env });
  const opened = (
    await mesa.sessions.open('lantern-cove', {
      background: true,
      mode: 'plan',
      goal: 'Read the project',
    })
  ).result;
  expect(opened).toMatchObject({
    background: true,
    backgroundId: 'abcdef12',
    mode: 'plan',
    vaultMounted: true,
  });
  expect(opened.agentSessionId).toBeUndefined();
  // The job's process has the supervisor's environment: the binding travels in its settings.
  expect(launchArgs).toEqual([
    '--bg',
    '--permission-mode',
    'plan',
    `--settings={"env":{"MESA_SESSION_ID":"${opened.id}","MESA_PROFILE":"default"}}`,
    '--mcp-config={"mcpServers":{"mesa-vault":{"type":"stdio","command":"/usr/local/bin/mesa","args":["vault","mcp"]}}}',
    '--allowedTools=mcp__mesa-vault',
    'Read the project',
  ]);
  for (const name of ['MESA_SESSION_ID', 'MESA_PROFILE', 'CLAUDECODE', 'NO_COLOR'])
    expect(launchEnv).not.toHaveProperty(name);
  expect(world.tmux.windows.at(-1)?.launch).toBe('unset NO_COLOR; exec claude attach abcdef12');
  exitAll(world);
  const row = (await mesa.sessions.list()).find((s) => s.id === opened.id);
  expect(row).toMatchObject({
    alive: true,
    lastState: { state: 'idle' },
    agentSessionId: 'abcdef12-0000-4000-8000-000000000001',
  });
  expect((await mesa.sessions.attach(opened.id)).attached.opened).toBe(true);
  expect(world.tmux.windows.at(-1)?.launch).toBe('unset NO_COLOR; exec claude attach abcdef12');
  expect((await mesa.sessions.stop(opened.id)).result.outcome).toBe('exited');
  const resumed = (await mesa.sessions.resume(opened.id)).result.record;
  // Attached again to the process started with the mount.
  expect(resumed).toMatchObject({
    background: true,
    backgroundId: 'abcdef12',
    resumedFrom: opened.id,
    vaultMounted: true,
  });
  expect(world.tmux.windows.at(-1)?.launch).toBe('unset NO_COLOR; exec claude attach abcdef12');
  exitAll(world);
  const ended = (await mesa.sessions.list()).find((s) => s.id === resumed.id);
  expect(ended).toMatchObject({ alive: false, lastState: { state: 'done' } });
  expect(ended?.managed && ended.events.some((event) => event.type === 'exited')).toBe(true);
  await mesa.sessions.remove(resumed.id, { force: true });
  expect((await mesa.sessions.list(true)).some((session) => session.id === resumed.id)).toBe(false);
  await expect(
    mesa.sessions.open('lantern-cove', { agent: 'codex', background: true }),
  ).rejects.toMatchObject({ code: 'usage' });
});

test('a child terminal starts in its parent worktree', async () => {
  const world = agentWorld();
  const { dir, mesa } = await setUp(world);
  gitRepo(dir);
  const parent = (await mesa.sessions.open('lantern-cove', { branch: 'feature' })).result;
  const child = (await mesa.sessions.open('lantern-cove', { terminal: true, parent: parent.id }))
    .result;
  expect(child).toMatchObject({
    kind: 'terminal',
    parent: parent.id,
    cwd: parent.worktree?.path,
    project: 'lantern-cove',
  });
  const opened = world.calls.find((call) => call.args.includes('new-window'))?.args ?? [];
  expect(opened.slice(opened.indexOf('-c'), opened.indexOf('-c') + 2)).toEqual([
    '-c',
    parent.worktree?.path,
  ]);
  const branched = (
    await mesa.sessions.open('lantern-cove', {
      terminal: true,
      parent: parent.id,
      branch: 'child-branch',
    })
  ).result;
  expect(branched.worktree?.branch).toBe('child-branch');
  expect(branched.cwd).toBeUndefined();
});

test("with config sessions.log off, a window's output is not piped to a log", async () => {
  const world = agentWorld();
  const { home, mesa } = await setUp(world);
  mesa.config.set('sessions.log', 'false');
  const { result } = await mesa.sessions.open('lantern-cove');
  expect(world.tmux.windows[0]?.pipe).toBeUndefined();
  expect(world.calls.some((c) => c.args.includes('pipe-pane'))).toBe(false);
  expect(existsSync(profilePaths(home, 'default').logs)).toBe(false);
  expect(mesa.sessions.logs(result.id)).toEqual({ session: result.id, path: null, lines: [] });
});

test('the agent comes from the flag, else mesa.yaml, else the profile', async () => {
  const world = agentWorld();
  const { mesa } = await setUp(world, { mesaYaml: 'name: lantern-cove\nagent: codex\n' });
  expect((await mesa.sessions.open('lantern-cove')).result.agent).toBe('codex');
  expect((await mesa.sessions.open('lantern-cove', { agent: 'claude' })).result.agent).toBe(
    'claude',
  );
  await expect(mesa.sessions.open('lantern-cove', { agent: 'gpt' })).rejects.toMatchObject({
    code: 'agent_unavailable',
    message: 'unknown agent gpt; agents are claude, codex, antigravity',
  });

  const plain = await setUp(agentWorld({ codex: false }));
  plain.mesa.config.set('defaultAgent', 'codex');
  await expect(plain.mesa.sessions.open('lantern-cove')).rejects.toMatchObject({
    code: 'agent_unavailable',
    message: 'codex not found on PATH; install with `brew install --cask codex`',
  });
});

test('open starts codex embedded, its goal after --, in window codex-<id>, with no agent session id yet', async () => {
  const world = agentWorld();
  const { mesa, dir } = await setUp(world);
  const { result } = await mesa.sessions.open('lantern-cove', { agent: 'codex', goal: 'review' });
  expect(result).toMatchObject({
    agent: 'codex',
    goal: 'review',
    tmux: { session: 'lantern-cove', window: `codex-${result.id}` },
  });
  // Codex picks its own thread id: a look at the board reads it (agents/codex/).
  expect(result).not.toHaveProperty('agentSessionId');
  expect(launched(world)).toBe(`codex -c mesa.embedded=true ${CODEX_MOUNT} -- 'review'`);
  expect(world.tmux.windows.at(-1)?.path).toBe(dir);

  await mesa.sessions.open('lantern-cove', { agent: 'codex' });
  expect(launched(world)).toBe(`codex -c mesa.embedded=true ${CODEX_MOUNT}`);
});

test('show learns a Codex thread ID and its native context reading in the same look', async () => {
  const world = agentWorld();
  const { mesa, dir } = await setUp(world, { env: world.codex.env });
  const { result } = await mesa.sessions.open('lantern-cove', { agent: 'codex' });
  const id = '01a0e693-6c67-71d0-8cd9-e0ace3513477';
  const at = new Date(Date.parse(result.startedAt) + 1000).toISOString();
  const file = world.codex.rollout({ id, cwd: dir, startedAt: at });
  appendFileSync(
    file,
    `\n${JSON.stringify({
      timestamp: at,
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          last_token_usage: { input_tokens: 25942, cached_input_tokens: 12544 },
          model_context_window: 258400,
        },
      },
    })}\n`,
  );
  const shown = await mesa.sessions.show(result.id);
  expect(shown).toMatchObject({
    agentSessionId: id,
    context: { used: 10.04, window: 258400, at, source: 'transcript' },
  });
});

test('Antigravity opens with a private per-session log and reads its native ID after the first prompt', async () => {
  const world = agentWorld();
  const { mesa, home } = await setUp(world);
  const { result: first } = await mesa.sessions.open('lantern-cove', {
    agent: 'antigravity',
    goal: 'Reply ALIVE',
  });
  const firstLog = join(profilePaths(home, 'default').logs, `${first.id}.agy.log`);
  expect(launched(world)).toBe(
    `umask 077; exec agy --log-file '${firstLog}' --prompt-interactive 'Reply ALIVE'`,
  );
  expect(first).not.toHaveProperty('agentSessionId');
  const { result: second } = await mesa.sessions.open('lantern-cove', { agent: 'antigravity' });
  const secondLog = join(profilePaths(home, 'default').logs, `${second.id}.agy.log`);
  expect(launched(world)).toBe(`umask 077; exec agy --log-file '${secondLog}'`);
  writeFileSync(firstLog, 'Created conversation 002f58d1-9e29-4682-9bc1-3a2dc5da1115\n');
  writeFileSync(secondLog, 'Created conversation cd66cf01-f466-4c11-8f12-a8fd0885d9f4\n');
  const rows = await mesa.sessions.list();
  expect(rows.find((row) => row.id === first.id)?.agentSessionId).toBe(
    '002f58d1-9e29-4682-9bc1-3a2dc5da1115',
  );
  expect(rows.find((row) => row.id === second.id)?.agentSessionId).toBe(
    'cd66cf01-f466-4c11-8f12-a8fd0885d9f4',
  );
});

test('an unavailable Antigravity CLI points to its native installation instructions', async () => {
  const { mesa } = await setUp(agentWorld({ antigravity: false }));
  await expect(mesa.sessions.open('lantern-cove', { agent: 'antigravity' })).rejects.toMatchObject({
    code: 'agent_unavailable',
    message: expect.stringContaining('https://antigravity.google/docs/cli/install/'),
  });
});

test('an unknown project, a missing claude, or a failed window leaves no session', async () => {
  const { mesa } = await setUp(agentWorld());
  await expect(mesa.sessions.open('tide')).rejects.toMatchObject({
    code: 'not_found',
    message: 'no project named tide; see mesa projects',
  });

  const noClaude = await setUp(agentWorld({ claude: false }));
  await expect(noClaude.mesa.sessions.open('lantern-cove')).rejects.toMatchObject({
    code: 'agent_unavailable',
    message: 'claude not found on PATH; install with `brew install --cask claude-code`',
  });
  expect(await noClaude.mesa.sessions.list()).toEqual([]);

  const broken = await setUp(agentWorld({ failing: 'new-session' }));
  await expect(broken.mesa.sessions.open('lantern-cove')).rejects.toMatchObject({
    code: 'internal',
  });
  expect(await broken.mesa.sessions.list()).toEqual([]);
  expect(listReceipts(join(broken.home, 'vault'))).toEqual([]);
});

test('a project whose folder is gone is not_found, even with --agent', async () => {
  const { dir, mesa } = await setUp(agentWorld());
  rmSync(dir, { recursive: true });
  await expect(mesa.sessions.open('lantern-cove', { agent: 'claude' })).rejects.toMatchObject({
    code: 'not_found',
  });
});

test('an open session attaches to its exact window on the profile socket', async () => {
  const { mesa } = await setUp(agentWorld());
  const { result } = await mesa.sessions.open('lantern-cove');
  expect((await mesa.sessions.attach(result.id)).exec).toEqual([
    'tmux',
    '-u',
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
    'select-window',
    '-t',
    expect.stringMatching(new RegExp(`^=_view-[0-9a-z]{8}:=claude-${result.id}$`)),
    ';',
    'set-option',
    'destroy-unattached',
    'on',
  ]);
});

/** The command the last window runs: the word after `/bin/sh -c`. */
const launched = (world: ReturnType<typeof agentWorld>) => {
  const args = world.calls.filter((c) => c.args.includes('-n')).at(-1)?.args ?? [];
  return args[args.indexOf('/bin/sh') + 2];
};

test('a goal is the first prompt: one shell word after the session id, kept on the record', async () => {
  const world = agentWorld();
  const { mesa } = await setUp(world);
  const goal = `/goal Print "ready" in $HOME, then 'stop'`;
  const { result } = await mesa.sessions.open('lantern-cove', { goal });
  expect(launched(world)).toBe(
    // Single quotes keep $HOME and the double quotes literal; each ' becomes '\''.
    String.raw`unset NO_COLOR; exec claude --session-id 00000000-0000-4000-8000-000000000001 ${CLAUDE_MOUNT} '/goal Print "ready" in $HOME, then '\''stop'\'''`,
  );
  expect(result.goal).toBe(goal);
  expect(mesa.sessions.goal(result.id)).toEqual({ id: result.id, goal });

  const { result: plain } = await mesa.sessions.open('lantern-cove');
  expect(launched(world)).toBe(
    `unset NO_COLOR; exec claude --session-id 00000000-0000-4000-8000-000000000002 ${CLAUDE_MOUNT}`,
  );
  expect(() => mesa.sessions.goal(plain.id)).toThrow(
    expect.objectContaining({ code: 'not_found', message: `session ${plain.id} has no goal` }),
  );
});

test('opening with a secret goal keeps it local and creates no vault receipt', async () => {
  // A key in the goal, and a character outside the BMP at the cut: the cut counts characters.
  // 40 characters once redacted, 39 more, then the rocket as character 80.
  const goal = `Deploy with sk-live-1234 and write the notes for ${'n'.repeat(39)}🚀 then stop and report back`;
  const short = Array.from(goal.replace('sk-live-1234', '***')).slice(0, 80).join('');
  expect(Array.from(short).at(-1)).toBe('🚀');
  const forms: [string[], string][] = [
    [
      ['open', 'lantern-cove', '--goal', goal],
      `mesa open lantern-cove --goal ${JSON.stringify(short)}`,
    ],
    [['open', 'lantern-cove', `--goal=${goal}`], `mesa open lantern-cove "--goal=${short}"`],
  ];
  for (const [argv] of forms) {
    const { home, mesa } = await setUp(agentWorld(), { argv });
    mesa.config.set('keys.jev', 'sk-live-1234');
    const { result, receipt } = await mesa.sessions.open('lantern-cove', { goal });
    expect(result.goal).toBe(goal);
    expect(receipt).toBeNull();
    expect(listReceipts(join(home, 'vault'))).toEqual([]);
  }
});

test('a goal file is read as UTF-8; a bad goal is refused without vault history', async () => {
  const world = agentWorld();
  const { home, mesa } = await setUp(world);
  const file = join(home, 'goal.md');
  writeFileSync(file, '/goal Keep going until `pnpm verify` is green.\nThen stop.\n');
  const { result } = await mesa.sessions.open('lantern-cove', { goalFile: file });
  expect(result.goal).toBe('/goal Keep going until `pnpm verify` is green.\nThen stop.\n');
  expect(launched(world)).toBe(
    `unset NO_COLOR; exec claude --session-id 00000000-0000-4000-8000-000000000001 ${CLAUDE_MOUNT} '/goal Keep going until \`pnpm verify\` is green.\nThen stop.\n'`,
  );

  // A BOM an editor saved goes, so the goal still starts /goal.
  const bom = join(home, 'bom.md');
  writeFileSync(bom, '\uFEFF/goal Ship it\n');
  const { result: withBom } = await mesa.sessions.open('lantern-cove', { goalFile: bom });
  expect(withBom.goal).toBe('/goal Ship it\n');

  const latin1 = join(home, 'latin1.md');
  writeFileSync(latin1, Buffer.from([0x63, 0x61, 0x66, 0xe9]));
  const nul = join(home, 'nul.md');
  writeFileSync(nul, 'before\0after');
  const loop = join(home, 'loop.md');
  symlinkSync(loop, loop);
  const cases: [object, string, string][] = [
    [{ goalFile: join(home, 'nope.md') }, 'not_found', `no goal file at ${join(home, 'nope.md')}`],
    [{ goalFile: home }, 'not_found', `no goal file at ${home}`],
    [{ goal: 'x', goalFile: file }, 'usage', 'pass --goal or --goal-file, not both'],
    [{ goal: '' }, 'usage', 'the goal is empty'],
    [{ goal: ' \n\t' }, 'usage', 'the goal is empty'],
    [{ goal: '--help' }, 'usage', 'a goal cannot start with -: claude would read it as a flag'],
    [{ goalFile: nul }, 'usage', 'the goal holds a NUL byte'],
    [{ goalFile: latin1 }, 'usage', `the goal file ${latin1} is not UTF-8 text`],
    [{ goalFile: loop }, 'usage', `cannot read the goal file ${loop}: ELOOP`],
    [
      // 4000 three-byte characters: 4002 UTF-16 units quoted, but 12002 bytes.
      { goal: '日'.repeat(4000) },
      'usage',
      'the goal makes a 12230-byte command, over the 12000 Mesa passes to tmux: shorten it, or keep the long part in a file the goal names',
    ],
  ];
  cases.push(
    [
      { goal: `/goal ${'x'.repeat(4001)}` },
      'usage',
      'the /goal condition is 4001 characters, over the 4000 Claude Code takes: shorten it, or keep the long part in a file the goal names',
    ],
    [
      { goal: '/goal Ship it', agent: 'codex' },
      'usage',
      'codex has no /goal command and would take the goal as plain text: start it with claude, or drop /goal',
    ],
  );
  for (const [opts, code, message] of cases) {
    await expect(mesa.sessions.open('lantern-cove', opts)).rejects.toMatchObject({ code, message });
  }
  await expect(
    mesa.sessions.open('lantern-cove', { goal: 'x'.repeat(11_930) }),
  ).rejects.toMatchObject({
    code: 'usage',
    message: expect.stringContaining('over the 12000 Mesa passes to tmux'),
  });
  expect(listReceipts(join(home, 'vault'))).toEqual([]);
  expect((await mesa.sessions.list()).map((s) => s.id)).toEqual([result.id, withBom.id]);
});

test('resume keeps the goal on the new record but does not send it again', async () => {
  const world = agentWorld();
  const { mesa } = await setUp(world);
  const { result: first } = await mesa.sessions.open('lantern-cove', { goal: 'Print ready' });
  exitAll(world);
  const { result } = await mesa.sessions.resume(first.id);
  expect(launched(world)).toBe(
    `unset NO_COLOR; exec claude --resume ${first.agentSessionId} ${CLAUDE_MOUNT}`,
  );
  expect(result.record.goal).toBe('Print ready');
});

test('a session opened inside another is its child: from MESA_SESSION_ID, --parent, or none', async () => {
  const world = agentWorld();
  const { home, mesa } = await setUp(world);
  const { result: a } = await mesa.sessions.open('lantern-cove');
  expect(a.parent).toBeUndefined();
  // Inside a's window, every mesa has a's id and profile in its environment.
  const within = (env: Record<string, string>) =>
    createMesa('default', testDeps(home, { run: world.run, env, newId }));
  const inside = within({ MESA_SESSION_ID: a.id, MESA_PROFILE: 'default' });
  const { result: child } = await inside.sessions.open('lantern-cove');
  expect(child.parent).toBe(a.id);
  // The window's session alone, as the issue's test plan types it, is enough.
  const bare = await within({ MESA_SESSION_ID: a.id }).sessions.open('lantern-cove');
  expect(bare.result.parent).toBe(a.id);
  expect(listReceipts(join(home, 'vault'))).toEqual([]);
  const { result: explicit } = await inside.sessions.open('lantern-cove', { parent: child.id });
  expect(explicit.parent).toBe(child.id);
  const { result: none } = await inside.sessions.open('lantern-cove', { noParent: true });
  expect(none.parent).toBeUndefined();
  // Another profile's window, an empty id, or a removed session: no parent, and no error.
  for (const env of [
    { MESA_SESSION_ID: a.id, MESA_PROFILE: 'work' },
    { MESA_SESSION_ID: '', MESA_PROFILE: 'default' },
    { MESA_SESSION_ID: 'gonegone', MESA_PROFILE: 'default' },
  ]) {
    expect((await within(env).sessions.open('lantern-cove')).result.parent).toBeUndefined();
  }

  const before = (await mesa.sessions.list()).length;
  await expect(inside.sessions.open('lantern-cove', { parent: 'zzzzzzzz' })).rejects.toMatchObject({
    code: 'not_found',
    message: 'no session zzzzzzzz to be the parent; see mesa sessions, or pass --no-parent',
  });
  expect(listReceipts(join(home, 'vault'))).toEqual([]);
  await expect(
    inside.sessions.open('lantern-cove', { parent: a.id, noParent: true }),
  ).rejects.toMatchObject({ code: 'usage', message: 'pass --parent or --no-parent, not both' });
  expect(await mesa.sessions.list()).toHaveLength(before);

  // A resumed session keeps its place in the tree.
  exitAll(world);
  const { result } = await mesa.sessions.resume(child.id);
  expect(result.record.parent).toBe(a.id);
});

/** The folder the last window started in. */
const cwdOf = (world: ReturnType<typeof agentWorld>) => {
  const args = world.calls.filter((c) => c.args.includes('-n')).at(-1)?.args ?? [];
  return args[args.indexOf('-c') + 1];
};

/** The branch's upstream, or undefined when it tracks nothing. */
const upstreamOf = (dir: string, branch: string) => {
  try {
    return testGit(dir, 'config', '--get', `branch.${branch}.merge`);
  } catch {
    return undefined;
  }
};

test('--branch starts the agent in a new worktree under the profile, from the default branch', async () => {
  const world = agentWorld();
  const { home, dir, mesa } = await setUp(world);
  gitRepo(dir);
  const { result } = await mesa.sessions.open('lantern-cove', { branch: 'try/worktree' });
  const path = worktreeAt(home, 'lantern-cove', 'try-worktree');
  // No origin: the current branch is the default.
  expect(result.worktree).toEqual({ path, branch: 'try/worktree', base: 'main' });
  expect(cwdOf(world)).toBe(path);
  expect(testGit(dir, 'worktree', 'list', '--porcelain')).toContain(
    `worktree ${path}\nHEAD ${testGit(dir, 'rev-parse', 'main')}\nbranch refs/heads/try/worktree`,
  );
  expect(listReceipts(join(home, 'vault'))).toEqual([]);
  // The board shows it; a resume runs in the same worktree, where claude keeps the conversation.
  const [row] = await mesa.sessions.list();
  expect(row).toMatchObject({ managed: true, worktree: result.worktree });
  exitAll(world);
  const { result: resumed } = await mesa.sessions.resume(result.id);
  expect(resumed.record.worktree).toEqual(result.worktree);
  expect(cwdOf(world)).toBe(path);
});

test('session branch creation follows the same configured sibling location as manual worktrees', async () => {
  const world = agentWorld();
  const { dir, mesa } = await setUp(world);
  gitRepo(dir);
  mesa.config.set('worktrees.location', 'sibling');
  const { result } = await mesa.sessions.open('lantern-cove', { branch: 'shared-setting' });
  const path = join(dirname(dir), '.mesa-worktrees', 'default', 'lantern-cove', 'shared-setting');
  expect(result.worktree?.path).toBe(path);
  expect(cwdOf(world)).toBe(path);
  const { result: manual } = await mesa.worktrees.create('lantern-cove', 'manual');
  const { result: attached } = await mesa.sessions.open('lantern-cove', { branch: 'manual' });
  expect(attached.worktree).toEqual({ path: manual.path, branch: 'manual' });
  expect(cwdOf(world)).toBe(manual.path);
});

test('a failed session launch preserves data written by configured worktree setup', async () => {
  const world = agentWorld({ failing: 'new-session' });
  const original = withGit(world);
  const run: Runner = (file, args, ms, options) => {
    if (file === '/usr/bin/touch') {
      writeFileSync(join(options?.cwd ?? '', args[0] ?? ''), 'setup data');
      return Promise.resolve({ ok: true, stdout: '' });
    }
    return original(file, args, ms, options);
  };
  const { home, dir, mesa } = await setUp(world, { run });
  gitRepo(dir);
  mesa.config.set('worktrees.setup', '["/usr/bin/touch", "keep.txt"]');
  await expect(mesa.sessions.open('lantern-cove', { branch: 'with-setup' })).rejects.toMatchObject({
    code: 'internal',
  });
  expect(
    readFileSync(join(worktreeAt(home, 'lantern-cove', 'with-setup'), 'keep.txt'), 'utf8'),
  ).toBe('setup data');
  expect(await mesa.sessions.list()).toEqual([]);
});

test("--branch refuses a project's unapproved worktree setup and creates nothing", async () => {
  const world = agentWorld();
  const mesaYaml = 'name: lantern-cove\nworktrees:\n  setup: [/usr/bin/touch, repo-file]\n';
  const { home, dir, mesa } = await setUp(world, { mesaYaml });
  gitRepo(dir);
  await expect(mesa.sessions.open('lantern-cove', { branch: 'unreviewed' })).rejects.toMatchObject({
    code: 'needs_approval',
    message: expect.stringContaining('setup ["/usr/bin/touch","repo-file"]'),
  });
  expect(existsSync(worktreeAt(home, 'lantern-cove', 'unreviewed'))).toBe(false);
  expect(testGit(dir, 'branch', '--list', 'unreviewed')).toBe('');
  expect(testGit(dir, 'worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1);
  expect(await mesa.sessions.list()).toEqual([]);
  expect(world.tmux.windows).toEqual([]);
});

test("a failed session launch preserves data written by the project's own worktree setup", async () => {
  const world = agentWorld({ failing: 'new-session' });
  const original = withGit(world);
  const run: Runner = (file, args, ms, options) => {
    if (file === '/usr/bin/touch') {
      writeFileSync(join(options?.cwd ?? '', args[0] ?? ''), 'setup data');
      return Promise.resolve({ ok: true, stdout: '' });
    }
    return original(file, args, ms, options);
  };
  const mesaYaml = 'name: lantern-cove\nworktrees:\n  setup: [/usr/bin/touch, keep.txt]\n';
  const { home, dir, mesa } = await setUp(world, { run, mesaYaml });
  gitRepo(dir);
  mesa.projects.trust(
    'lantern-cove',
    Object.values(mesa.projects.pending('lantern-cove')).map((script) => script.fingerprint),
  );
  await expect(mesa.sessions.open('lantern-cove', { branch: 'with-setup' })).rejects.toMatchObject({
    code: 'internal',
  });
  expect(
    readFileSync(join(worktreeAt(home, 'lantern-cove', 'with-setup'), 'keep.txt'), 'utf8'),
  ).toBe('setup data');
});

test("with an origin, a new branch starts from origin's HEAD, tracking nothing, or from its branch there, tracking it", async () => {
  const world = agentWorld();
  const { home, dir, mesa } = await setUp(world);
  gitRepo(dir);
  const bare = join(home, 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', bare]);
  testGit(dir, 'remote', 'add', 'origin', bare);
  testGit(dir, 'commit', '-q', '--allow-empty', '-m', 'shared work');
  testGit(dir, 'push', '-q', 'origin', 'main', 'main:shared');
  testGit(dir, 'reset', '-q', '--hard', 'HEAD~1');
  testGit(dir, 'remote', 'set-head', 'origin', 'main');

  const { result } = await mesa.sessions.open('lantern-cove', { branch: 'two' });
  expect(result.worktree?.base).toBe('origin/main');
  // A push from the worktree never goes to main.
  expect(upstreamOf(dir, 'two')).toBeUndefined();

  // A branch only on origin continues from there, and pulls from it.
  const { result: shared } = await mesa.sessions.open('lantern-cove', { branch: 'shared' });
  expect(shared.worktree?.base).toBe('origin/shared');
  expect(testGit(worktreeAt(home, 'lantern-cove', 'shared'), 'rev-parse', 'HEAD')).toBe(
    testGit(dir, 'rev-parse', 'origin/shared'),
  );
  expect(upstreamOf(dir, 'shared')).toBe('refs/heads/shared');
});

test('--base starts the new branch there; an existing branch is reused as it is', async () => {
  const world = agentWorld();
  const { home, dir, mesa } = await setUp(world);
  gitRepo(dir);
  testGit(dir, 'commit', '-q', '--allow-empty', '-m', 'second');
  testGit(dir, 'branch', 'older', 'HEAD~1');
  const { result } = await mesa.sessions.open('lantern-cove', { branch: 'fix', base: 'older' });
  expect(result.worktree?.base).toBe('older');
  expect(testGit(worktreeAt(home, 'lantern-cove', 'fix'), 'rev-parse', 'HEAD')).toBe(
    testGit(dir, 'rev-parse', 'older'),
  );

  testGit(dir, 'branch', 'kept', 'HEAD~1');
  await expect(
    mesa.sessions.open('lantern-cove', { branch: 'kept', base: 'main' }),
  ).rejects.toMatchObject({
    code: 'usage',
    message: 'branch kept exists and is reused as it is: drop --base, or pick a new branch',
  });
  const { result: reused } = await mesa.sessions.open('lantern-cove', { branch: 'kept' });
  // No base: nothing was started from one.
  expect(reused.worktree).toEqual({
    path: worktreeAt(home, 'lantern-cove', 'kept'),
    branch: 'kept',
  });
  expect(testGit(worktreeAt(home, 'lantern-cove', 'kept'), 'rev-parse', 'HEAD')).toBe(
    testGit(dir, 'rev-parse', 'kept'),
  );

  // A second session on a branch a session has, or one whose folder is the same: that session
  // is named, the newest of a resumed pair.
  exitAll(world);
  const { result: resumed } = await mesa.sessions.resume(reused.id);
  await expect(mesa.sessions.open('lantern-cove', { branch: 'kept' })).rejects.toMatchObject({
    code: 'usage',
    message: `session ${resumed.record.id} has kept's worktree at ${worktreeAt(home, 'lantern-cove', 'kept')}: use that session, or pick another branch`,
  });
  const { result: slashed } = await mesa.sessions.open('lantern-cove', { branch: 'a/b' });
  await expect(mesa.sessions.open('lantern-cove', { branch: 'a-b' })).rejects.toMatchObject({
    code: 'usage',
    message: `session ${slashed.id} has a/b's worktree at ${worktreeAt(home, 'lantern-cove', 'a-b')}: use that session, or pick another branch`,
  });
  // A worktree removed by hand is not the session's any more: the branch opens again.
  testGit(dir, 'worktree', 'remove', worktreeAt(home, 'lantern-cove', 'fix'));
  const { result: fixAgain } = await mesa.sessions.open('lantern-cove', { branch: 'fix' });
  expect(fixAgain.worktree).toEqual({
    path: worktreeAt(home, 'lantern-cove', 'fix'),
    branch: 'fix',
  });
  // The first session on fix cannot resume into the worktree the new one has.
  await expect(mesa.sessions.resume(result.id)).rejects.toMatchObject({
    code: 'usage',
    message: `the worktree at ${worktreeAt(home, 'lantern-cove', 'fix')} is session ${fixAgain.id}'s now: two sessions never share one`,
  });
  // Its worktree gone, the session cannot resume: its conversation was there.
  testGit(dir, 'worktree', 'remove', worktreeAt(home, 'lantern-cove', 'kept'));
  await expect(mesa.sessions.resume(resumed.record.id)).rejects.toMatchObject({
    code: 'not_found',
    message: `session ${resumed.record.id}'s folder ${worktreeAt(home, 'lantern-cove', 'kept')} is gone, and claude resumes its conversation only there`,
  });
});

test('a non-git project, a branch in use, or a bad branch or base is usage with the reason, and no session', async () => {
  const world = agentWorld();
  const { home, dir, mesa } = await setUp(world);
  await expect(mesa.sessions.open('lantern-cove', { branch: 'x' })).rejects.toMatchObject({
    code: 'usage',
    message: expect.stringMatching(
      new RegExp(`^${dir} is not a git repository: fatal: not a git repository`),
    ),
  });
  expect(listReceipts(join(home, 'vault'))).toEqual([]);

  gitRepo(dir);
  // main is checked out in the project folder.
  await expect(mesa.sessions.open('lantern-cove', { branch: 'main' })).rejects.toMatchObject({
    code: 'usage',
    message: `cannot check out main: fatal: 'main' is already used by worktree at '${dir}'`,
  });
  // Not a name git takes, or one it would turn into another branch.
  testGit(dir, 'checkout', '-q', '-b', 'side');
  testGit(dir, 'checkout', '-q', 'main');
  // `@{-1}` is side to git.
  for (const branch of ['a..b', '-x', '@{-1}']) {
    await expect(mesa.sessions.open('lantern-cove', { branch })).rejects.toMatchObject({
      code: 'usage',
      message: `${branch} is not a valid branch name`,
    });
  }
  await expect(
    mesa.sessions.open('lantern-cove', { branch: 'y', base: '-nope' }),
  ).rejects.toMatchObject({
    code: 'usage',
    message: expect.stringMatching(/^cannot start y from -nope: fatal: .*-nope/),
  });
  await expect(mesa.sessions.open('lantern-cove', { base: 'main' })).rejects.toMatchObject({
    code: 'usage',
    message: '--base needs --branch',
  });
  // A detached HEAD, and no origin: no default to start from.
  testGit(dir, 'checkout', '-q', '--detach');
  await expect(mesa.sessions.open('lantern-cove', { branch: 'z' })).rejects.toMatchObject({
    code: 'usage',
    message: `${dir} has no default branch to start from: pass --base`,
  });
  testGit(dir, 'checkout', '-q', 'main');
  // A path taken (two branches can map to one folder) is left alone.
  mkdirSync(worktreeAt(home, 'lantern-cove', 'p-q'), { recursive: true });
  writeFileSync(join(worktreeAt(home, 'lantern-cove', 'p-q'), 'notes.md'), 'mine\n');
  await expect(mesa.sessions.open('lantern-cove', { branch: 'p/q' })).rejects.toMatchObject({
    code: 'usage',
    message: `${worktreeAt(home, 'lantern-cove', 'p-q')} already exists: pick another branch, or remove it`,
  });
  expect(existsSync(join(worktreeAt(home, 'lantern-cove', 'p-q'), 'notes.md'))).toBe(true);
  // A project in a folder below the repository's top.
  const sub = join(dir, 'harbor');
  mkdirSync(sub);
  writeFileSync(join(sub, 'mesa.yaml'), 'name: harbor\n');
  mesa.projects.register(sub);
  await expect(mesa.sessions.open('harbor', { branch: 'h' })).rejects.toMatchObject({
    code: 'usage',
    message: `${sub} is below the top folder of its git repository: --branch needs a project at the top`,
  });
  expect(testGit(dir, 'branch', '--list', 'p/q', 'y', 'z', 'h')).toBe('');
  expect(await mesa.sessions.list()).toEqual([]);
});

test('a failed or killed add, or a window that cannot open, leaves no worktree and no new branch', async () => {
  // git's add was killed: after it made its branch and folder, or while it wrote the folder.
  let killed: 'after' | 'during' | undefined = 'after';
  const world = agentWorld();
  const run: Runner = async (file, args, ms) => {
    // Someone else makes `raced` just before Mesa does.
    if (args.includes('--no-track') && args.includes('raced'))
      testGit(args[1] ?? '', 'branch', 'raced');
    const add = args.includes('worktree') && args.includes('add');
    if (add && killed === 'during') {
      const path = args.at(-2) ?? '';
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, 'half.txt'), '');
      return { ok: false, reason: 'timeout', detail: 'killed' };
    }
    const res = await withGit(world)(file, args, ms);
    return add && killed ? { ok: false, reason: 'timeout', detail: 'killed' } : res;
  };
  const { home, dir, mesa } = await setUp(world, { run });
  gitRepo(dir);
  testGit(dir, 'branch', 'kept');
  await expect(mesa.sessions.open('lantern-cove', { branch: 'slow' })).rejects.toMatchObject({
    code: 'internal',
    message: 'git did not answer within 60 s',
  });
  expect(existsSync(worktreeAt(home, 'lantern-cove', 'slow'))).toBe(false);
  expect(testGit(dir, 'branch', '--list', 'slow')).toBe('');
  // A branch it reused stays.
  await expect(mesa.sessions.open('lantern-cove', { branch: 'kept' })).rejects.toMatchObject({
    message: 'git did not answer within 60 s',
  });
  expect(existsSync(worktreeAt(home, 'lantern-cove', 'kept'))).toBe(false);
  expect(testGit(dir, 'branch', '--list', 'kept')).toBe('kept');
  killed = 'during';
  await expect(mesa.sessions.open('lantern-cove', { branch: 'slow' })).rejects.toMatchObject({
    message: 'git did not answer within 60 s',
  });
  expect(existsSync(worktreeAt(home, 'lantern-cove', 'slow'))).toBe(false);
  killed = undefined;
  // The branch someone else made first is theirs, and stays.
  await expect(mesa.sessions.open('lantern-cove', { branch: 'raced' })).rejects.toMatchObject({
    message: expect.stringMatching(/^cannot start raced from main: fatal: .*already exists/),
  });
  expect(testGit(dir, 'branch', '--list', 'raced')).toBe('raced');

  // A worktree git still lists whose folder is gone is refused, and stays git's.
  testGit(dir, 'worktree', 'add', '-q', worktreeAt(home, 'lantern-cove', 'p-q'), '-b', 'p-q');
  rmSync(worktreeAt(home, 'lantern-cove', 'p-q'), { recursive: true });
  await expect(mesa.sessions.open('lantern-cove', { branch: 'p/q' })).rejects.toMatchObject({
    code: 'usage',
    message: `git lists a worktree at ${worktreeAt(home, 'lantern-cove', 'p-q')} already: pick another branch, or see git worktree list`,
  });
  expect(testGit(dir, 'branch', '--list', 'p/q')).toBe('');
  expect(testGit(dir, 'worktree', 'list', '--porcelain')).toContain('branch refs/heads/p-q');

  // Two opens of one new branch at once: one wins, and the other takes nothing from it.
  const both = await Promise.allSettled(
    [1, 2].map(() => mesa.sessions.open('lantern-cove', { branch: 'race' })),
  );
  expect(both.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
  expect(existsSync(join(worktreeAt(home, 'lantern-cove', 'race'), 'mesa.yaml'))).toBe(true);
  expect(testGit(dir, 'worktree', 'list', '--porcelain')).toContain('branch refs/heads/race');

  // The window cannot open: the branch Mesa made goes, the one it reused stays.
  const broken = agentWorld({ failing: 'new-session' });
  const again = await setUp(broken);
  gitRepo(again.dir);
  testGit(again.dir, 'branch', 'kept');
  for (const branch of ['fresh', 'kept']) {
    await expect(again.mesa.sessions.open('lantern-cove', { branch })).rejects.toMatchObject({
      code: 'internal',
    });
    expect(existsSync(worktreeAt(again.home, 'lantern-cove', branch))).toBe(false);
  }
  expect(testGit(again.dir, 'worktree', 'list', '--porcelain')).not.toContain('.mesa');
  const { result: manual } = await again.mesa.worktrees.create('lantern-cove', 'manual');
  writeFileSync(join(manual.path, 'keep.txt'), 'personal work');
  await expect(
    again.mesa.sessions.open('lantern-cove', { branch: 'manual' }),
  ).rejects.toMatchObject({
    code: 'internal',
  });
  expect(existsSync(join(manual.path, 'keep.txt'))).toBe(true);
  expect(testGit(again.dir, 'branch', '--list', 'manual')).toBe('+ manual');
  expect(testGit(again.dir, 'branch', '--list', 'fresh', 'kept', 'manual')).toBe('kept\n+ manual');
  expect(await again.mesa.sessions.list()).toEqual([]);
});

test('every refusal before the window comes before the worktree, and a missing git says so', async () => {
  const noClaude = await setUp(agentWorld({ claude: false }));
  gitRepo(noClaude.dir);
  await expect(noClaude.mesa.sessions.open('lantern-cove', { branch: 'b' })).rejects.toMatchObject({
    code: 'agent_unavailable',
  });
  const long = await setUp(agentWorld());
  gitRepo(long.dir);
  await expect(
    long.mesa.sessions.open('lantern-cove', { branch: 'b', goal: 'x'.repeat(12_000) }),
  ).rejects.toMatchObject({ code: 'usage' });
  for (const { home, dir } of [noClaude, long]) {
    expect(existsSync(profilePaths(home, 'default').worktrees)).toBe(false);
    expect(testGit(dir, 'branch', '--list', 'b')).toBe('');
  }

  const world = agentWorld();
  const noGit = await setUp(world, {
    run: (file, args, ms) =>
      file === 'git'
        ? Promise.resolve({ ok: false, reason: 'missing', detail: 'ENOENT' })
        : world.run(file, args, ms),
  });
  await expect(noGit.mesa.sessions.open('lantern-cove', { branch: 'b' })).rejects.toMatchObject({
    code: 'internal',
    message: 'git not found on PATH; --branch needs it',
  });
});

test('through a symlinked home, a worktree git lists is still seen', async () => {
  const { home, dir, mesa } = await setUp(agentWorld(), { linkedHome: true });
  gitRepo(dir);
  testGit(dir, 'worktree', 'add', '-q', worktreeAt(home, 'lantern-cove', 'gone'), '-b', 'gone-old');
  rmSync(worktreeAt(home, 'lantern-cove', 'gone'), { recursive: true });
  await expect(mesa.sessions.open('lantern-cove', { branch: 'gone' })).rejects.toMatchObject({
    code: 'usage',
    message: `git lists a worktree at ${worktreeAt(home, 'lantern-cove', 'gone')} already: pick another branch, or see git worktree list`,
  });
  const { result } = await mesa.sessions.open('lantern-cove', { branch: 'fine' });
  expect(result.worktree?.path).toBe(worktreeAt(home, 'lantern-cove', 'fine'));
});

test('open links the enabled skills where the agent runs before its window opens; a failure warns', async () => {
  const world = agentWorld();
  let dir = '';
  // Whether the mesa skill was linked when tmux was asked for the window.
  const linkedAtStart: boolean[] = [];
  const run: Runner = (file, args, ms) => {
    if (file === 'tmux' && args.some((a) => a === 'new-session' || a === 'new-window')) {
      linkedAtStart.push(existsSync(join(dir, '.claude/skills/mesa/SKILL.md')));
    }
    return withGit(world)(file, args, ms);
  };
  const made = await setUp(world, { run });
  dir = made.dir;
  const { mesa, home } = made;
  const { warning } = await mesa.sessions.open('lantern-cove');
  expect(linkedAtStart).toEqual([true]);
  expect(warning).toBeUndefined();

  // In its own worktree the links go there, and git does not count them: the worktree is clean.
  gitRepo(dir);
  const { result } = await mesa.sessions.open('lantern-cove', { branch: 'skilled' });
  const path = result.worktree?.path ?? '';
  expect(existsSync(join(path, '.agents/skills/mesa/SKILL.md'))).toBe(true);
  expect(testGit(path, 'status', '--porcelain')).toBe('');

  // A folder the links cannot go in: the session opens anyway, and says why they are missing.
  const blocked = join(home, 'src/lantern-cove/.agents');
  rmSync(blocked, { recursive: true, force: true });
  writeFileSync(blocked, 'not a folder');
  const opened = await mesa.sessions.open('lantern-cove');
  expect(opened.result.id).toMatch(/^[0-9a-z]{8}$/);
  expect(opened.warning).toMatch(/^skills not synced into .*lantern-cove: /);
});

test("each additional project's worktree gets its own enabled skills; a failed link only warns", async () => {
  const world = agentWorld();
  const { home, mesa } = await acrossProjects(world);
  const { result, warning } = await mesa.sessions.open('lantern-cove', { with: ['tide-pool'] });
  const tide = result.additional?.[0]?.worktree.path ?? '';
  expect(existsSync(join(tide, '.claude/skills/mesa/SKILL.md'))).toBe(true);
  expect(warning).toBeUndefined();

  // A worktree whose checkout has a file where the links go: the session opens anyway, and says so.
  const harbor = gitProject(mesa, home, 'harbor');
  writeFileSync(join(harbor, '.agents'), 'not a folder');
  testGit(harbor, 'add', '.agents');
  testGit(harbor, 'commit', '-q', '-m', 'a file');
  const opened = await mesa.sessions.open('lantern-cove', { with: ['harbor'] });
  const path = opened.result.additional?.[0]?.worktree.path ?? '';
  expect(opened.warning).toMatch(new RegExp(`^skills not synced into ${path}: `));
  expect(existsSync(join(opened.result.worktree?.path ?? '', '.agents/skills/mesa/SKILL.md'))).toBe(
    true,
  );
});

test('resume links the enabled skills where the conversation reopens, as open does', async () => {
  const world = agentWorld();
  const { dir, mesa } = await setUp(world);
  const { result: first } = await mesa.sessions.open('lantern-cove');
  exitAll(world);
  for (const links of ['.claude/skills', '.agents/skills']) {
    rmSync(join(dir, links), { recursive: true, force: true });
  }
  const { warning } = await mesa.sessions.resume(first.id);
  expect(warning).toBeUndefined();
  for (const skill of ['mesa', 'mesa-handoff']) {
    expect(existsSync(join(dir, '.claude/skills', skill, 'SKILL.md'))).toBe(true);
  }
});

test('launch defaults reach new, resumed, and background sessions; a dangerous start keeps a receipt', async () => {
  const world = agentWorld();
  const base = withGit(world);
  let background: readonly string[] = [];
  const run: Runner = (file, args, ms, options) => {
    if (file === 'claude' && args[0] === '--bg') {
      background = args;
      return Promise.resolve({ ok: true, stdout: 'backgrounded · abcdef12\n' });
    }
    return base(file, args, ms, options);
  };
  const { mesa, home } = await setUp(world, { run });
  const vault = join(home, 'vault');
  const launch = () => world.tmux.windows.at(-1)?.launch ?? '';

  // On native config a start emits no flag and, as any routine start, keeps no receipt.
  expect((await mesa.sessions.open('lantern-cove')).receipt).toBeNull();
  expect(launch()).not.toContain('--dangerously');

  mesa.config.set('agents.claude.skipPermissions', 'true');
  mesa.config.set('agents.codex.sandbox', 'workspace-write');
  const claude = await mesa.sessions.open('lantern-cove');
  expect(launch()).toContain(' --dangerously-skip-permissions ');
  expect(claude.receipt).not.toBeNull();
  expect(listReceipts(vault, 10, { session: claude.result.id })[0]?.receipt).toMatchObject({
    kind: 'guardrail',
    type: 'session',
    outputs: { dangerousFlags: '--dangerously-skip-permissions' },
  });

  // A flag that keeps the agent's checks on is emitted, with no receipt.
  const codex = await mesa.sessions.open('lantern-cove', { agent: 'codex' });
  expect(launch()).toContain(' --sandbox=workspace-write ');
  expect(codex.receipt).toBeNull();

  exitAll(world);
  const resumed = await mesa.sessions.resume(claude.result.id);
  expect(launch()).toContain(
    `--resume ${claude.result.agentSessionId} --dangerously-skip-permissions `,
  );
  expect(resumed.receipt).not.toBeNull();
  expect(
    listReceipts(vault, 10, { session: resumed.result.record.id })[0]?.receipt.outputs,
  ).toMatchObject({ dangerousFlags: '--dangerously-skip-permissions' });

  const bg = (await mesa.sessions.open('lantern-cove', { background: true })).result;
  expect(background).toContain('--dangerously-skip-permissions');
  // A resume only attaches to that process, with no flags: no dangerous start to keep.
  exitAll(world);
  const attached = await mesa.sessions.resume(bg.id);
  expect(launch()).toBe('unset NO_COLOR; exec claude attach abcdef12');
  expect(attached.receipt).toBeNull();

  // A dependency change that starts nothing is no dangerous start either.
  const running = (await mesa.sessions.open('lantern-cove')).result;
  expect(
    (await mesa.sessions.dependencies(running.id, { parent: claude.result.id })).receipt,
  ).toBeNull();
});

/** lantern-cove and tide-pool as git repositories, through the real git. */
async function acrossProjects(world: ReturnType<typeof agentWorld>, run?: Runner) {
  const set = await setUp(world, { env: world.codex.env, ...(run ? { run } : {}) });
  gitRepo(set.dir);
  return { ...set, tide: gitProject(set.mesa, set.home, 'tide-pool') };
}

test('each agent gets the additional worktrees as extra folders in its own form', async () => {
  const world = agentWorld();
  const { mesa } = await acrossProjects(world);
  const launch = () => world.tmux.windows.at(-1)?.launch ?? '';
  const opened = async (agent: string, branch: string) => {
    const { result } = await mesa.sessions.open('lantern-cove', {
      agent,
      with: ['tide-pool'],
      branch,
      goal: 'go',
    });
    return { ...result, extra: result.additional?.[0]?.worktree.path ?? '' };
  };
  const claude = await opened('claude', 'c');
  expect(launch()).toBe(
    `unset NO_COLOR; exec claude --session-id ${claude.agentSessionId} ${CLAUDE_MOUNT} '--add-dir=${claude.extra}' 'go'`,
  );
  const codex = await opened('codex', 'x');
  expect(launch()).toBe(
    `codex -c mesa.embedded=true --sandbox=workspace-write ${CODEX_MOUNT} '--add-dir' '${codex.extra}' -- 'go'`,
  );
  const { extra: agy } = await opened('antigravity', 'a');
  expect(launch()).toContain(` '--add-dir=${agy}' --prompt-interactive 'go'`);
});

test("a read-only profile's Codex --with session gets workspace-write, a warning and a kept receipt", async () => {
  const world = agentWorld();
  const { mesa, home } = await acrossProjects(world);
  const launch = () => world.tmux.windows.at(-1)?.launch ?? '';
  const open = (branch: string) =>
    mesa.sessions.open('lantern-cove', { agent: 'codex', with: ['tide-pool'], branch, goal: 'go' });

  // Unset: workspace-write, as for any Codex --with session, with no warning and no receipt.
  const native = await open('n');
  expect(native.warning).toBeUndefined();
  expect(native.receipt).toBeNull();

  mesa.config.set('agents.codex.sandbox', 'read-only');
  const { result, warning, receipt } = await open('r');
  const extra = result.additional?.[0]?.worktree.path ?? '';
  expect(launch()).toBe(
    `codex -c mesa.embedded=true --sandbox=workspace-write ${CODEX_MOUNT} '--add-dir' '${extra}' -- 'go'`,
  );
  expect(warning).toBe(
    'Codex runs read-only in this profile; this session gets workspace-write so it can change the other projects',
  );
  expect(receipt).not.toBeNull();
  expect(listReceipts(join(home, 'vault'), 10, { session: result.id })[0]?.receipt).toMatchObject({
    kind: 'guardrail',
    type: 'session',
    outputs: { sandboxOverride: 'read-only to workspace-write' },
  });

  // Without --with, the configured read-only stays, with no override.
  const alone = await mesa.sessions.open('lantern-cove', { agent: 'codex' });
  expect(launch()).toContain(' --sandbox=read-only ');
  expect(alone.warning).toBeUndefined();
  expect(alone.receipt).toBeNull();
});

test("resume, handoff and swap carry a session's additional projects; a gone one is not_found", async () => {
  const world = agentWorld();
  const { home, mesa } = await acrossProjects(world);
  const launch = () => world.tmux.windows.at(-1)?.launch ?? '';
  const { result: fresh } = await mesa.sessions.open('lantern-cove', { with: ['tide-pool'] });
  const extra = fresh.additional?.[0]?.worktree.path ?? '';
  // Swap: the same session, the new agent given the same folders.
  const swapped = (await mesa.sessions.swap(fresh.id, 'codex')).result;
  expect(swapped.additional).toEqual(fresh.additional);
  expect(launch()).toContain(` '--add-dir' '${extra}'`);

  const { result: first } = await mesa.sessions.open('lantern-cove', {
    with: ['tide-pool'],
    goal: 'Tie them',
  });
  const path = first.additional?.[0]?.worktree.path ?? '';
  exitAll(world);
  const { result: resumed } = await mesa.sessions.resume(first.id);
  expect(resumed.record.additional).toEqual(first.additional);
  expect(launch()).toContain(
    `--resume ${first.agentSessionId} ${CLAUDE_MOUNT} '--add-dir=${path}'`,
  );

  const note = join(home, 'note.md');
  writeFileSync(note, '## Left\n');
  await expect(
    mesa.sessions.handoff(resumed.record.id, { note, keep: true }),
  ).rejects.toMatchObject({
    code: 'usage',
    message: `session ${resumed.record.id} runs in its own worktree, and in tide-pool's, which its successor takes over; two sessions never share one, so it cannot be kept`,
  });
  const { to } = (await mesa.sessions.handoff(resumed.record.id, { note })).result;
  expect(to).toMatchObject({ worktree: first.worktree, additional: first.additional });
  expect(launch()).toContain(`'--add-dir=${path}' 'Tie them`);

  exitAll(world);
  await mesa.sessions.stop(to.id, true);
  rmSync(path, { recursive: true });
  const before = (await mesa.sessions.list(true)).length;
  await expect(mesa.sessions.resume(to.id)).rejects.toMatchObject({
    code: 'not_found',
    message: `tide-pool's worktree ${path} is gone: the session works there too`,
  });
  expect(await mesa.sessions.list(true)).toHaveLength(before);
});

test("Claude's background start carries the additional folders before its goal", async () => {
  const world = agentWorld();
  const base = withGit(world);
  let background: readonly string[] = [];
  const run: Runner = (file, args, ms, options) => {
    if (file === 'claude' && args[0] === '--bg') {
      background = args;
      return Promise.resolve({ ok: true, stdout: 'backgrounded · abcdef12\n' });
    }
    return base(file, args, ms, options);
  };
  const { mesa } = await acrossProjects(world, run);
  const { result } = await mesa.sessions.open('lantern-cove', {
    with: ['tide-pool'],
    background: true,
    goal: 'Tie them',
  });
  expect(background.slice(-2)).toEqual([
    `--add-dir=${result.additional?.[0]?.worktree.path}`,
    'Tie them',
  ]);
});

test('--with is refused where a session cannot span projects', async () => {
  const world = agentWorld();
  const { home, mesa } = await acrossProjects(world);
  const refused = (opts: Parameters<typeof mesa.sessions.open>[1], project?: string) =>
    expect(mesa.sessions.open(project, { with: ['tide-pool'], ...opts })).rejects.toMatchObject({
      code: 'usage',
    });
  await refused({ general: true });
  await refused({ terminal: true }, 'lantern-cove');
  await refused({ checkout: home }, 'lantern-cove');
  expect(await mesa.sessions.list()).toEqual([]);
});
