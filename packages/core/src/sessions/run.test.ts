import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { listReceipts } from '../receipts/store.js';
import {
  agentWorld,
  claudeResult,
  type FakeWindow,
  finishesRun,
  newSession,
  profilePaths,
  projectProfile,
  shortIds,
  testStore,
} from '../testing/index.js';

const UUID = '00000000-0000-4000-8000-000000000001';
/** lantern-cove with session-summary enabled in its mesa.yaml, and claude in the fake tmux. */
const setUp = (world: ReturnType<typeof agentWorld>, sleep = async () => {}) =>
  projectProfile(world.run, {
    mesaYaml: 'name: lantern-cove\nskills: [session-summary]\n',
    argv: ['run', 'session-summary', '--project', 'lantern-cove'],
    sleep,
  });

test('a run execs claude -p on the skill, reads its result, and ends done, its window closed', async () => {
  const world = agentWorld({ onOpen: finishesRun({ output: claudeResult('success') }) });
  const { home, dir, mesa } = setUp(world);
  mesa.config.set('run.allowedTools', '[Read, "Bash(git log:*)"]');

  const { result, receipt } = await mesa.sessions.run('session-summary', {
    project: 'lantern-cove',
    args: ['focus', 'on tests'],
  });
  const id = result.session;
  const output = join(profilePaths(home, 'default').runs, `${id}.json`);
  const stderr = join(profilePaths(home, 'default').runs, `${id}.err`);
  expect(result).toEqual({
    session: id,
    ok: true,
    output: expect.stringMatching(/^\*\*Goal:\*\* Tidy/),
    agentSessionId: UUID,
    costUsd: 0.0421,
    durationMs: 8421,
  });
  // stdin closed, stdout and stderr into the profile's runs/, and exec, so the pane's exit is claude's.
  expect(world.tmux.windows).toEqual([]);
  const launch = world.calls
    .find((c) => c.file === 'tmux' && c.args.includes('new-session'))
    ?.args.find((a) => a.startsWith('exec '));
  expect(launch).toBe(
    `exec claude -p '/session-summary focus on tests' --session-id ${UUID} --output-format json --permission-mode 'acceptEdits' --allowedTools 'Read' 'Bash(git log:*)' </dev/null >'${output}' 2>'${stderr}'`,
  );
  expect(existsSync(output)).toBe(true);
  // The skill was linked into the folder claude ran in, as every start does.
  expect(existsSync(join(dir, '.claude/skills/session-summary/SKILL.md'))).toBe(true);
  expect(testStore(home).get(id)).toMatchObject({
    kind: 'run',
    goal: '/session-summary focus on tests',
    agentSessionId: UUID,
    endedAt: expect.any(String),
    lastState: { state: 'done', confidence: 1, source: 'mesa' },
    events: [{ type: 'exited', at: expect.any(String), status: 0 }],
  });
  const [started] = listReceipts(join(home, 'vault'));
  expect(started?.path).toBe(receipt?.path);
  expect(started?.receipt).toMatchObject({
    type: 'skill',
    status: 'ok',
    project: 'lantern-cove',
    session: id,
    agent: 'claude',
    inputs: { skill: 'session-summary', agent: null, args: ['focus', 'on tests'] },
    // As it started: a headless agent works until it exits.
    outputs: {
      window: `claude-${id}`,
      agentSessionId: UUID,
      lastState: { state: 'working', confidence: 0.85 },
    },
  });
  expect(started?.summary).toBe(`Started skill session-summary on lantern-cove as session ${id}`);
  // On the board beside live sessions: a run, done.
  const [row] = await mesa.sessions.list(true);
  expect(row).toMatchObject({ id, kind: 'run', lastState: { state: 'done' } });

  // mesa rm takes its output with the record.
  const { result: removed } = await mesa.sessions.remove(id);
  expect(removed).toMatchObject({ runOutput: true, events: false, window: false });
  expect(existsSync(output)).toBe(false);
});

test('an error claude reports, and a nonzero exit with no result, are not ok, with the reason', async () => {
  const reported = agentWorld({
    onOpen: finishesRun({ output: claudeResult('not-logged-in'), status: 1 }),
  });
  const first = setUp(reported);
  const { result } = await first.mesa.sessions.run('session-summary', { project: 'lantern-cove' });
  expect(result).toMatchObject({
    ok: false,
    output: 'Not logged in · Please run /login',
    agentSessionId: UUID,
    costUsd: 0,
    durationMs: 68,
    reason: 'Not logged in · Please run /login',
  });
  expect(testStore(first.home).get(result.session).lastState.state).toBe('failed');

  // claude refused its flags: no result, its exit, and the last line it printed on stderr.
  const refused = agentWorld({
    onOpen: finishesRun({ output: '', status: 1, stderr: "error: unknown option '--bogus'\n\n" }),
  });
  const second = setUp(refused);
  const run = await second.mesa.sessions.run('session-summary', { project: 'lantern-cove' });
  expect(run.result).toEqual({
    session: run.result.session,
    ok: false,
    output: '',
    agentSessionId: UUID,
    durationMs: 0,
    reason:
      "claude printed no result; claude exited with status 1; error: unknown option '--bogus'",
  });
  expect(testStore(second.home).get(run.result.session).lastState.state).toBe('failed');

  // Killed before it wrote anything: no output file at all.
  const killed = setUp(agentWorld({ onOpen: finishesRun({ signal: 'SIGKILL' }) }));
  const gone = await killed.mesa.sessions.run('session-summary', { project: 'lantern-cove' });
  expect(gone.result.reason).toMatch(/^no output at .*\.json; claude was killed by SIGKILL$/);

  // A result that says ok from a claude that then exited nonzero is not ok.
  const odd = setUp(
    agentWorld({ onOpen: finishesRun({ output: claudeResult('success'), status: 3 }) }),
  );
  const exited = await odd.mesa.sessions.run('session-summary', { project: 'lantern-cove' });
  expect(exited.result).toMatchObject({
    ok: false,
    output: expect.stringMatching(/^\*\*Goal/),
    reason: 'claude exited with status 3',
  });
});

test("a run's end starts what was queued after it, as a stop does", async () => {
  const world = agentWorld();
  let whileRunning = async () => {};
  const { home, mesa } = setUp(world, () => whileRunning());
  whileRunning = async () => {
    whileRunning = async () => {};
    const [run] = testStore(home).list();
    await mesa.sessions.open('lantern-cove', { after: run?.id, goal: 'Read the summary' });
    finishesRun({ output: claudeResult('success') })(world.tmux.windows[0] as FakeWindow);
  };
  const { result } = await mesa.sessions.run('session-summary', { project: 'lantern-cove' });
  expect(result.ok).toBe(true);
  const next = testStore(home)
    .list()
    .find((r) => r.after === result.session);
  expect(next).toMatchObject({ kind: 'interactive', lastState: { state: 'idle' } });
  expect(world.tmux.windows.map((w) => w.window)).toEqual([`claude-${next?.id}`]);
});

test("tmux's pane-died hook ends a run as its wait would: once that wait is gone, or before it looks", async () => {
  // Its mesa run is killed while it waits: the agent then exits, and only the hook sees it.
  const world = agentWorld();
  let whileRunning = async () => {};
  const { home, mesa } = setUp(world, () => whileRunning());
  whileRunning = async () => {
    finishesRun({ output: '', status: 2, stderr: 'error: bad flag\n' })(
      world.tmux.windows[0] as FakeWindow,
    );
    throw new Error('mesa run was killed');
  };
  await expect(mesa.sessions.run('session-summary', { project: 'lantern-cove' })).rejects.toThrow(
    'mesa run was killed',
  );
  const [orphan] = testStore(home).list();
  const window = `claude-${orphan?.id}`;
  expect(orphan?.endedAt).toBeUndefined();
  expect(await mesa.tmuxEvent('pane-died', 'lantern-cove', window)).toMatchObject({ kind: 'run' });
  expect(world.tmux.windows).toEqual([]);
  expect(testStore(home).get(orphan?.id ?? '')).toMatchObject({
    endedAt: expect.any(String),
    lastState: { state: 'failed', confidence: 1, source: 'mesa' },
    events: [{ type: 'exited', at: expect.any(String), status: 2 }],
  });

  // The hook ends it first: the wait reads the same result, the exit from the record.
  whileRunning = async () => {
    const [w] = world.tmux.windows;
    finishesRun({ output: '', status: 2, stderr: 'error: bad flag\n' })(w as FakeWindow);
    await mesa.tmuxEvent('pane-died', 'lantern-cove', w?.window ?? '');
  };
  const { result } = await mesa.sessions.run('session-summary', { project: 'lantern-cove' });
  expect(result.reason).toBe(
    'claude printed no result; claude exited with status 2; error: bad flag',
  );
  expect(testStore(home).get(result.session).lastState.state).toBe('failed');
});

test('a run takes no prompt and has nothing to hand off', async () => {
  const world = agentWorld();
  const { home, mesa } = setUp(world);
  const run = testStore(home, 'default', shortIds('runabcde')).create(() =>
    newSession({ kind: 'run', goal: '/session-summary' }),
  );
  const refused = (e: { code: string; message: string }) => ({ code: e.code, message: e.message });
  expect(await mesa.sessions.send(run.id, 'hello').catch(refused)).toEqual({
    code: 'usage',
    message:
      'session runabcde is a skill run (mesa run), which takes no prompt: its agent reads no input and ends by itself',
  });
  expect(await mesa.sessions.handoff(run.id, { note: 'note.md' }).catch(refused)).toEqual({
    code: 'usage',
    message:
      'session runabcde is a skill run (mesa run), which has no work to hand off: its agent reads no input and ends by itself',
  });
});

test('past its timeout a run is killed, ended failed, and a timeout error', async () => {
  const world = agentWorld();
  let slept = 0;
  const { home, mesa } = setUp(world, async () => {
    slept += 1;
  });
  const error = await mesa.sessions
    .run('session-summary', { project: 'lantern-cove', timeoutSeconds: 3 })
    .catch((e: unknown) => e);
  const [record] = testStore(home).list();
  expect(error).toMatchObject({
    code: 'timeout',
    message: `session ${record?.id} ran /session-summary past its 3 s timeout: its window was closed and the session marked failed`,
    details: { session: record?.id },
  });
  // Looked at 0, 1, 2, and 3 s, a second apart.
  expect(slept).toBe(3);
  expect(world.tmux.windows).toEqual([]);
  expect(record).toMatchObject({
    kind: 'run',
    endedAt: expect.any(String),
    lastState: { state: 'failed', source: 'mesa' },
  });
});

test('a skill the project does not see or enable, another agent, or a bad timeout starts nothing', async () => {
  const world = agentWorld();
  const { home, mesa } = setUp(world);
  const refused = (
    skill: string,
    opts: { agent?: string; timeoutSeconds?: number; args?: string[] } = {},
  ) =>
    mesa.sessions
      .run(skill, { project: 'lantern-cove', ...opts })
      .catch((e: { code: string; message: string }) => ({ code: e.code, message: e.message }));
  expect(await refused('tidy-readme')).toEqual({
    code: 'usage',
    message:
      "no skill tidy-readme in the library or in lantern-cove's own skills; see mesa skills list lantern-cove",
  });
  // In the library, but neither the profile nor this project's mesa.yaml enables it.
  const plain = projectProfile(world.run);
  expect(
    await plain.mesa.sessions
      .run('session-summary', { project: 'lantern-cove' })
      .catch((e: Error) => e.message),
  ).toBe(
    "skill session-summary is not enabled for lantern-cove: add it to the profile's skills (mesa config set skills) or to its mesa.yaml skills",
  );
  expect(await refused('session-summary', { agent: 'codex' })).toMatchObject({
    code: 'agent_unavailable',
    message: 'codex support is planned in #43',
  });
  expect(await refused('session-summary', { timeoutSeconds: 0 })).toMatchObject({ code: 'usage' });
  // Counted on the line tmux gets: claude's command fits, with its redirects it does not.
  const bare = (n: number) =>
    `claude -p '/session-summary ${'x'.repeat(n)}' --session-id ${UUID} --output-format json --permission-mode 'acceptEdits'`;
  const long = 'x'.repeat(11_990 - bare(0).length);
  expect(bare(long.length)).toHaveLength(11_990);
  expect(await refused('session-summary', { args: [long] })).toMatchObject({
    code: 'usage',
    message: expect.stringMatching(/^the goal makes a 12\d{3}-byte command/),
  });
  expect(
    await mesa.sessions.run('nope', { project: 'tide' }).catch((e: { code: string }) => e.code),
  ).toBe('not_found');
  expect(world.tmux.windows).toEqual([]);
  expect(testStore(home).list()).toEqual([]);
  expect(listReceipts(join(home, 'vault')).map((r) => r.receipt.status)).toContain('failed');
});
