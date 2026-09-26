import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { listReceipts } from '../receipts.js';
import { scriptedRunner, sequentialIds, tempDir, testDeps } from '../testing.js';

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

// One id source for the file, so a second mesa over the same home never reuses an id.
const newId = sequentialIds();

/** An initialised profile with its vault laid out and lantern-cove registered. */
async function setUp(
  world: ReturnType<typeof fakeWorld>,
  { mesaYaml = 'name: lantern-cove\n', argv = ['open'] } = {},
) {
  const home = tempDir();
  const dir = join(home, 'src/lantern-cove');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mesa.yaml'), mesaYaml);
  const mesa = createMesa('default', testDeps(home, { run: world.run, argv, newId }));
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
    // Through /bin/sh, never the user's shell, which may quote otherwise (fish, tcsh).
    '/bin/sh',
    '-c',
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
  const { mesa } = await setUp(world, { mesaYaml: 'name: lantern-cove\nagent: codex\n' });
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

/** The command the last window runs: the word after `/bin/sh -c`. */
const launched = (world: ReturnType<typeof fakeWorld>) => {
  const args = world.calls.filter((c) => c.args.includes('-n')).at(-1)?.args ?? [];
  return args[args.indexOf('/bin/sh') + 2];
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

test('the receipt keeps the goal first 80 characters, keys redacted, in its command too', async () => {
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
  for (const [argv, command] of forms) {
    const { home, mesa } = await setUp(fakeWorld(), { argv });
    mesa.config.set('keys.jev', 'sk-live-1234');
    await mesa.sessions.open('lantern-cove', { goal });
    const [entry] = listReceipts(join(home, 'vault'), 1);
    expect(entry?.receipt.inputs).toEqual({ project: 'lantern-cove', agent: null, goal: short });
    expect(entry?.receipt.command).toBe(command);
  }
});

test('a goal file is read as UTF-8; a bad goal is refused with a failed receipt and no session', async () => {
  const world = fakeWorld();
  const { home, mesa } = await setUp(world);
  const file = join(home, 'goal.md');
  writeFileSync(file, '/goal Keep going until `pnpm verify` is green.\nThen stop.\n');
  const { result } = await mesa.sessions.open('lantern-cove', { goalFile: file });
  expect(result.goal).toBe('/goal Keep going until `pnpm verify` is green.\nThen stop.\n');
  expect(launched(world)).toBe(
    "claude --session-id 00000000-0000-4000-8000-000000000001 '/goal Keep going until `pnpm verify` is green.\nThen stop.\n'",
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
      'the goal makes a 12059-byte command, over the 12000 Mesa passes to tmux: shorten it, or keep the long part in a file the goal names',
    ],
  ];
  const failedBefore = listReceipts(join(home, 'vault'), 50).filter(
    (e) => e.receipt.status === 'failed',
  ).length;
  for (const [opts, code, message] of cases) {
    await expect(mesa.sessions.open('lantern-cove', opts)).rejects.toMatchObject({ code, message });
  }
  const failed = listReceipts(join(home, 'vault'), 50).filter((e) => e.receipt.status === 'failed');
  expect(failed.length - failedBefore).toBe(cases.length);
  expect((await mesa.sessions.list()).map((s) => s.id)).toEqual([result.id, withBom.id]);
});

test('resume keeps the goal on the new record but does not send it again', async () => {
  const world = fakeWorld();
  const { mesa } = await setUp(world);
  const { result: first } = await mesa.sessions.open('lantern-cove', { goal: 'Print ready' });
  const { result } = await mesa.sessions.resume(first.id);
  expect(launched(world)).toBe(`claude --resume ${first.agentSessionId}`);
  expect(result.record.goal).toBe('Print ready');
});

test('a session opened inside another is its child: from MESA_SESSION_ID, --parent, or none', async () => {
  const world = fakeWorld();
  const { home, mesa } = await setUp(world);
  const { result: a } = await mesa.sessions.open('lantern-cove');
  expect(a.parent).toBeUndefined();
  // Inside a's window, every mesa has a's id and profile in its environment.
  const within = (env: Record<string, string>) =>
    createMesa('default', testDeps(home, { run: world.run, env, newId }));
  const inside = within({ MESA_SESSION_ID: a.id, MESA_PROFILE: 'default' });
  const { result: child } = await inside.sessions.open('lantern-cove');
  expect(child.parent).toBe(a.id);
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
  const [refused] = listReceipts(join(home, 'vault'), 1);
  expect(refused?.receipt).toMatchObject({ status: 'failed', inputs: { parent: 'zzzzzzzz' } });
  await expect(
    inside.sessions.open('lantern-cove', { parent: a.id, noParent: true }),
  ).rejects.toMatchObject({ code: 'usage', message: 'pass --parent or --no-parent, not both' });
  expect(await mesa.sessions.list()).toHaveLength(before);

  // A resumed session keeps its place in the tree.
  const { result } = await mesa.sessions.resume(child.id);
  expect(result.record.parent).toBe(a.id);
});
