import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createContext } from '../context.js';
import { listReceipts } from '../receipts/store.js';
import {
  agentWorld,
  CLAUDE_HEADLESS_MOUNT,
  CODEX_MOUNT,
  claudeResult,
  codexResult,
  type FakeWindow,
  finishesRun,
  fixedClock,
  newSession,
  plantOutputLog,
  profilePaths,
  projectProfile,
  shortIds,
  testDeps,
  testStore,
} from '../testing/index.js';
import { readNote, writeNote } from '../vault/notes.js';
import { endRun, type RunEnd, runOutput } from './run.js';

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
  expect(result).toEqual({
    session: id,
    ok: true,
    output: expect.stringMatching(/^The session had no work to summarise/),
    agentSessionId: UUID,
    costUsd: 0.2621986,
    durationMs: 19113,
  });
  // stdin closed, stdout into the profile's runs/, and exec, so the pane's exit is claude's.
  expect(world.tmux.windows).toEqual([]);
  const launch = world.calls
    .find((c) => c.file === 'tmux' && c.args.includes('new-session'))
    ?.args.find((a) => a.startsWith('exec '));
  expect(launch).toBe(
    `exec claude -p '/session-summary focus on tests' --session-id ${UUID} --output-format json --permission-mode 'acceptEdits' ${CLAUDE_HEADLESS_MOUNT} 'Read' 'Bash(git log:*)' </dev/null >'${output}'`,
  );
  expect(existsSync(output)).toBe(true);
  // Logged as every window is: its pane, claude's errors, goes to its output log.
  const log = join(profilePaths(home, 'default').logs, `${id}.log`);
  expect(world.calls.some((c) => c.args.includes(`cat >> '${log}'`))).toBe(true);
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
  expect(receipt).toBeNull();
  expect(listReceipts(join(home, 'vault'))).toEqual([]);
  // On the board beside live sessions: a run, done.
  const [row] = await mesa.sessions.list(true);
  expect(row).toMatchObject({ id, kind: 'run', lastState: { state: 'done' } });

  // mesa rm takes its output with the record.
  const { result: removed } = await mesa.sessions.remove(id);
  expect(removed).toMatchObject({ runOutput: true, events: false, window: false });
  expect(existsSync(output)).toBe(false);
});

test('Antigravity headless soft denial fails rather than landing an empty project brief', async () => {
  const output = JSON.stringify({
    conversation_id: UUID,
    status: 'SUCCESS',
    response: '',
    duration_seconds: 7.261,
    usage: { input_tokens: 30884, output_tokens: 704 },
  });
  const world = agentWorld({ onOpen: finishesRun({ output }) });
  const { home, mesa } = projectProfile(world.run, {
    mesaYaml: 'name: lantern-cove\nskills: [project-brief]\n',
  });
  const { result } = await mesa.sessions.run('project-brief', {
    project: 'lantern-cove',
    agent: 'antigravity',
  });
  expect(result).toMatchObject({
    ok: false,
    agentSessionId: UUID,
    reason: 'agy returned no response; check its stderr for denied tools',
  });
  expect(result.note).toBeUndefined();
  expect(testStore(home).get(result.session).lastState.state).toBe('failed');
  expect(existsSync(join(home, 'vault/projects/lantern-cove.md'))).toBe(false);
});

test('Antigravity prepares its private log with session output logging off', async () => {
  const world = agentWorld({
    onOpen: finishesRun({
      output: JSON.stringify({
        conversation_id: UUID,
        status: 'SUCCESS',
        response: 'Done',
        duration_seconds: 1,
        usage: {},
      }),
    }),
  });
  const { home, mesa } = projectProfile(world.run, {
    mesaYaml: 'name: lantern-cove\nskills: [project-brief]\n',
  });
  mesa.config.set('sessions.log', 'false');
  const { result } = await mesa.sessions.run('project-brief', {
    project: 'lantern-cove',
    agent: 'antigravity',
  });
  const log = join(profilePaths(home, 'default').logs, `${result.session}.agy.log`);
  expect(existsSync(profilePaths(home, 'default').logs)).toBe(true);
  expect(
    world.calls.some(
      (call) =>
        call.args.includes('new-session') &&
        call.args.some((arg) => arg.includes(`--log-file '${log}'`)),
    ),
  ).toBe(true);
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

  // claude refused its flags: no result, its exit, and the last line its pane showed, from its log.
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
    output: expect.stringMatching(/^The session had no work to summarise/),
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

test('a skill the project does not see or enable, or a bad timeout starts nothing', async () => {
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
  expect(await refused('session-summary', { timeoutSeconds: 0 })).toMatchObject({ code: 'usage' });
  // Counted on the line tmux gets: claude's command fits, with its redirects it does not.
  const bare = (n: number) =>
    `claude -p '/session-summary ${'x'.repeat(n)}' --session-id ${UUID} --output-format json --permission-mode 'acceptEdits' ${CLAUDE_HEADLESS_MOUNT}`;
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
  expect(listReceipts(join(home, 'vault'))).toEqual([]);
});

test('the guardrail gates a run before anything is written: a block or an ask opens nothing; --yes and --force run it', async () => {
  const world = agentWorld({ onOpen: finishesRun({ output: claudeResult('success') }) });
  const strict = projectProfile(world.run, {
    mesaYaml: 'name: lantern-cove\nguardrail: strict\nskills: [session-summary]\n',
    argv: ['run', 'session-summary', '--project', 'lantern-cove'],
  });
  const run = (opts: { args?: string[]; yes?: boolean; force?: boolean } = {}) =>
    strict.mesa.sessions.run('session-summary', { project: 'lantern-cove', ...opts });
  const latest = () => listReceipts(join(strict.home, 'vault'), 1)[0]?.receipt;

  await expect(run()).rejects.toMatchObject({
    code: 'guardrail_blocked',
    message:
      'the guardrail asks first: project lantern-cove has guardrail: strict; pass --yes to run it',
    details: { verdict: 'ask' },
  });
  expect(world.calls.some((c) => c.args.includes('new-session'))).toBe(false);
  expect(testStore(strict.home).list()).toEqual([]);
  expect(latest()).toMatchObject({
    type: 'skill',
    status: 'blocked',
    decisions: [{ question: 'verdict', answer: 'ask', confidence: 0.95 }, { answer: false }],
    outputs: { error: { code: 'guardrail_blocked' } },
  });

  // A destructive prompt is blocked even past --yes; --force runs it.
  await expect(run({ args: ['rm', '-rf', '/'], yes: true })).rejects.toMatchObject({
    code: 'guardrail_blocked',
    message:
      'blocked: the text holds a destructive command (rm -rf); pass --force to run it anyway',
  });
  expect(testStore(strict.home).list()).toEqual([]);
  const forced = await run({ args: ['rm', '-rf', '/'], force: true });
  expect(forced.result).toMatchObject({ ok: true, override: 'force' });
  expect(latest()).toMatchObject({
    status: 'ok',
    inputs: { force: true },
    outputs: { override: 'force' },
    decisions: [{ answer: 'block' }, { answer: true }],
  });

  const yes = await run({ yes: true });
  expect(yes.result).toMatchObject({ ok: true, override: 'yes' });
  expect(latest()).toMatchObject({
    status: 'ok',
    inputs: { yes: true },
    outputs: { override: 'yes', window: `claude-${yes.result.session}` },
  });
  expect(testStore(strict.home).list()).toHaveLength(2);
});

test('session-summary reads a cleaned, redacted log on stdin and core writes its linked wiki note once', async () => {
  const world = agentWorld();
  let during = async () => {};
  const { home, mesa } = setUp(world, () => during());
  const vault = join(home, 'vault');
  mesa.config.set('keys.tide', 'tide-key-0042');
  const { result: about } = await mesa.sessions.open('lantern-cove', {
    goal: 'Check lantern tides',
  });
  plantOutputLog(
    home,
    about.id,
    `\x1b[32mThree checks pass\x1b[0m\n${home}/work tide-key-0042\n${'x'.repeat(14000)}`,
  );
  let input = '';
  during = async () => {
    const w = world.tmux.windows.find((w) => w.launch.includes(' -p ')) as FakeWindow;
    const stdin = / <'([^']+)' >/.exec(w.launch)?.[1] ?? '';
    input = readFileSync(stdin, 'utf8');
    finishesRun({ output: claudeResult('success') })(w);
    await mesa.tmuxEvent('pane-died', 'lantern-cove', w.window);
  };
  const { result, receipt } = await mesa.sessions.run('session-summary', { session: about.id });
  expect(result.note).toBe(`wiki/sessions/${about.id}.md`);
  expect(input).toContain('Three checks pass\n~/work ***');
  expect(input).toContain('Its goal: Check lantern tides');
  expect(input).not.toContain('\x1b');
  expect(input.length).toBeGreaterThan(14000); // It never went on argv.
  expect(existsSync(join(profilePaths(home, 'default').runs, `${result.session}.input`))).toBe(
    false,
  );
  const note = readNote(vault, result.note ?? '');
  expect(note.frontmatter).toMatchObject({
    session: about.id,
    project: 'lantern-cove',
    run: result.session,
    source: 'mesa',
  });
  expect(note.body).toBe(`${result.output.trim()}\n`);
  const log = readFileSync(join(vault, 'log.md'), 'utf8');
  expect(
    log.split('\n').filter((line) => line.includes(`Summarised session ${about.id}`)),
  ).toHaveLength(1);
  const finished = listReceipts(vault).find((r) => r.receipt.id === receipt?.id)?.receipt;
  expect(finished).toMatchObject({
    status: 'ok',
    kind: 'vault-change',
    project: 'lantern-cove',
    session: about.id,
    inputs: { run: result.session, skill: 'session-summary', target: result.note },
    outputs: { target: result.note },
  });
  expect((await mesa.sessions.list(true)).find((r) => r.id === about.id)).toMatchObject({
    hasOutputLog: true,
  });
});

test('session-summary refuses missing logs and unknown sessions, and preserves a locked note', async () => {
  const world = agentWorld({ onOpen: finishesRun({ output: claudeResult('success') }) });
  const { home, mesa } = setUp(world);
  const { result: about } = await mesa.sessions.open('lantern-cove');
  await expect(mesa.sessions.run('session-summary', { session: about.id })).rejects.toThrow(
    'has no output',
  );
  await expect(mesa.sessions.run('session-summary', { session: 'zzzzzzzz' })).rejects.toMatchObject(
    { code: 'not_found' },
  );
  plantOutputLog(home, about.id, 'Three checks pass');
  const vault = join(home, 'vault');
  const path = `wiki/sessions/${about.id}.md`;
  writeNote(
    { vault, clock: fixedClock('2026-09-24T12:00:00Z') },
    { path, frontmatter: { locked: true }, body: 'Keep this note.\n' },
  );
  const before = readFileSync(join(vault, path), 'utf8');
  const ran = await mesa.sessions.run('session-summary', { session: about.id });
  expect(ran.result.ok).toBe(true);
  expect(ran.result.note).toBeUndefined();
  expect(ran.receipt).toBeNull();
  expect(ran.warning).toContain('locked');
  expect(readFileSync(join(vault, path), 'utf8')).toBe(before);
  expect(listReceipts(vault)).toEqual([]);
});

test('project-brief lands fixture output, refreshes generated sections, and keeps user blocks', async () => {
  let now = '2026-09-24T12:00:00Z';
  let brief =
    '## Purpose\nA lantern scheduler.\n\n## Stack\nTypeScript.\n\n## How to run\nRun mesa.\n\n## Open threads\nAdd alerts.';
  const world = agentWorld({
    onOpen: (window) =>
      finishesRun({
        output: JSON.stringify({ ...JSON.parse(claudeResult('success')), result: brief }),
      })(window),
  });
  const { home, dir, mesa } = projectProfile(world.run, {
    mesaYaml: 'name: lantern-cove\nskills: [project-brief]\n',
    clock: () => new Date(now),
  });
  const vault = join(home, 'vault');
  const path = 'projects/lantern-cove.md';
  const first = await mesa.sessions.run('project-brief', { project: 'lantern-cove' });
  expect(first.result.note).toBe(path);
  expect(existsSync(join(dir, '.claude/skills/project-brief/SKILL.md'))).toBe(true);
  expect(readNote(vault, path)).toMatchObject({
    frontmatter: {
      type: 'project',
      repo: dir,
      updated: '2026-09-24T12:00',
      run: first.result.session,
    },
    body: `${brief}\n`,
  });
  const kept = '<!-- keep -->\n## My notes\nKeep  spaces and café.\n<!-- keep -->';
  const secondKept = '<!-- keep -->\n## More notes\nSecond block.\n<!-- keep -->';
  writeFileSync(
    join(vault, path),
    `${readFileSync(join(vault, path), 'utf8')}\n${kept}\n\n${secondKept}\n`,
  );
  now = '2026-09-25T13:30:00Z';
  brief =
    '## Purpose\nA better lantern scheduler.\n\n## Stack\nTypeScript.\n\n## How to run\nRun mesa.\n\n## Open threads\nAdd alarms.';
  const second = await mesa.sessions.run('project-brief', { project: 'lantern-cove' });
  const note = readNote(vault, path);
  expect(note.frontmatter).toMatchObject({
    type: 'project',
    repo: dir,
    updated: '2026-09-25T13:30',
    run: second.result.session,
  });
  expect(note.body).toBe(`${brief}\n\n${kept}\n\n${secondKept}\n`);
  expect(note.body).not.toContain('Add alerts.');
  expect(readFileSync(join(vault, 'log.md'), 'utf8').match(/Updated project brief/g)).toHaveLength(
    2,
  );
  expect(
    listReceipts(vault).find((entry) => entry.receipt.id === second.receipt?.id)?.receipt,
  ).toMatchObject({
    kind: 'vault-change',
    status: 'ok',
    outputs: { target: path },
  });
});

test('project-brief leaves an existing note unchanged on malformed keep markers', async () => {
  const world = agentWorld({ onOpen: finishesRun({ output: claudeResult('success') }) });
  const { home, mesa } = projectProfile(world.run, {
    mesaYaml: 'name: lantern-cove\nskills: [project-brief]\n',
  });
  const path = join(home, 'vault/projects/lantern-cove.md');
  const first = await mesa.sessions.run('project-brief', { project: 'lantern-cove' });
  expect(first.result.note).toBe('projects/lantern-cove.md');
  const original = readFileSync(path, 'utf8');
  for (const marker of ['<!-- keep -->', '<!-- keep start -->']) {
    writeFileSync(path, `${original}\n${marker}\nMy notes.\n`);
    const before = readFileSync(path, 'utf8');
    const retry = await mesa.sessions.run('project-brief', { project: 'lantern-cove' });
    expect(retry.result.note).toBeUndefined();
    expect(retry.warning).toContain('marker');
    expect(readFileSync(path, 'utf8')).toBe(before);
  }
});

test('stopping a run with successful output keeps it failed when its waiter finishes later', async () => {
  const world = agentWorld();
  let during = async () => {};
  const { home, mesa } = setUp(world, () => during());
  during = async () => {
    const run = testStore(home)
      .list()
      .find((r) => r.kind === 'run');
    writeFileSync(
      join(profilePaths(home, 'default').runs, `${run?.id}.json`),
      claudeResult('success'),
    );
    await mesa.sessions.stop(run?.id ?? '', true);
  };
  const ran = await mesa.sessions.run('session-summary', { project: 'lantern-cove' });
  expect(ran.result).toMatchObject({ ok: false, reason: 'stopped by mesa stop' });
  expect(testStore(home).get(ran.result.session)).toMatchObject({
    lastState: { state: 'failed' },
    runFailure: 'stopped by mesa stop',
  });
  expect(listReceipts(join(home, 'vault'))).toEqual([]);
});

test('a fast hook lands a note once without polling again or a start receipt', async () => {
  const world = agentWorld({ onOpen: finishesRun({ output: claudeResult('success') }) });
  let early = async (_args: string[]) => {};
  let endedEarly = false;
  const { home, mesa } = projectProfile(
    async (file, args, options) => {
      if (endedEarly && file === 'tmux' && args.includes('list-windows'))
        throw new Error('waiter unavailable');
      const result = await world.run(file, args, options);
      if (file === 'tmux' && (args.includes('new-window') || args.includes('new-session')))
        await early([...args]);
      return result;
    },
    { mesaYaml: 'name: lantern-cove\nskills: [session-summary]\n' },
  );
  const about = testStore(home, 'default', shortIds('abcdefgh')).create(() => newSession());
  plantOutputLog(home, about.id, 'Three checks pass');
  early = async () => {
    const w = world.tmux.windows[0];
    if (w) await mesa.tmuxEvent('pane-died', 'lantern-cove', w.window);
    endedEarly = true;
  };
  const ran = await mesa.sessions.run('session-summary', { session: about.id });
  const note = readNote(join(home, 'vault'), ran.result.note ?? '');
  expect(note.frontmatter.run).toBe(ran.result.session);
  expect(
    listReceipts(join(home, 'vault')).find((r) => r.receipt.id === ran.receipt?.id)?.receipt,
  ).toMatchObject({ kind: 'vault-change', status: 'ok', outputs: { target: ran.result.note } });
});

test('a successful completion committed after the timeout read supplies the winning result', async () => {
  const world = agentWorld();
  const { home, dir } = setUp(world);
  const ctx = createContext('default', testDeps(home, { run: world.run }));
  const run = ctx.store.create((id) =>
    newSession({
      kind: 'run',
      goal: '/check',
      agentSessionId: UUID,
      tmux: { socket: ctx.paths.tmuxSocket, session: 'lantern-cove', window: `claude-${id}` },
    }),
  );
  await ctx.tmux.openWindow({
    project: run.project,
    window: run.tmux.window,
    cwd: dir,
    command: 'claude',
    env: {},
  });
  const pane = await ctx.tmux.findWindow({ project: run.project, window: run.tmux.window });
  if (!pane) throw new Error('missing fixture window');
  mkdirSync(ctx.paths.runs, { recursive: true });
  let winning: Promise<RunEnd> | undefined;
  const racing = {
    ...ctx,
    store: {
      ...ctx.store,
      update: ((id, change) => {
        writeFileSync(runOutput(ctx.paths.runs, id), claudeResult('success'));
        winning = endRun(ctx, run, { ...pane, dead: true, deadStatus: 0 });
        return ctx.store.update(id, change);
      }) as typeof ctx.store.update,
    },
  };
  const timedOut = await endRun(racing, run, undefined, 'timed out after 1 s');
  await winning;
  expect(ctx.store.get(run.id).lastState.state).toBe('done');
  expect(timedOut.result).toMatchObject({ ok: true, durationMs: 19113, agentSessionId: UUID });
});

test('a timeout keeps a successful output file failed, and non-writing skills need no vault landing', async () => {
  const world = agentWorld();
  const { home, mesa } = setUp(world, async () => {
    const run = testStore(home)
      .list()
      .find((r) => r.kind === 'run');
    writeFileSync(
      join(profilePaths(home, 'default').runs, `${run?.id}.json`),
      claudeResult('success'),
    );
  });
  await expect(
    mesa.sessions.run('session-summary', { project: 'lantern-cove', timeoutSeconds: 1 }),
  ).rejects.toMatchObject({ code: 'timeout' });
  expect(listReceipts(join(home, 'vault'))).toEqual([]);
  const finished = setUp(agentWorld({ onOpen: finishesRun({ output: claudeResult('success') }) }));
  finished.mesa.config.set('vault', finished.dir);
  const ran = await finished.mesa.sessions.run('session-summary', { project: 'lantern-cove' });
  expect(ran.result.ok).toBe(true);
  expect(ran.warning).toBeUndefined();
});

test('a hook that finishes after the deadline look wins over the waiter timeout', async () => {
  const world = agentWorld();
  let atDeadline = false;
  const { mesa } = projectProfile(
    async (file, args, options) => {
      const result = await world.run(file, args, options);
      if (atDeadline && file === 'tmux' && args.includes('list-windows')) {
        atDeadline = false;
        const w = world.tmux.windows[0] as FakeWindow;
        finishesRun({ output: claudeResult('success') })(w);
        await mesa.tmuxEvent('pane-died', 'lantern-cove', w.window);
        // The waiter receives the live snapshot taken before the hook completed.
      }
      return result;
    },
    {
      mesaYaml: 'name: lantern-cove\nskills: [session-summary]\n',
      sleep: async () => {
        atDeadline = true;
      },
    },
  );
  const ran = await mesa.sessions.run('session-summary', {
    project: 'lantern-cove',
    timeoutSeconds: 1,
  });
  expect(ran.result.ok).toBe(true);
});

test('Codex uses its native skill prompt and thread, keeps tokens locally, and reports failed exits', async () => {
  for (const status of [0, 1]) {
    let command = '';
    const world = agentWorld({
      onOpen: (window) => {
        command = window.launch;
        finishesRun({ output: codexResult('skill-stdin'), status })(window);
      },
    });
    const { home, dir, mesa } = setUp(world);
    const { result, receipt } = await mesa.sessions.run('session-summary', {
      project: 'lantern-cove',
      agent: 'codex',
      args: ['focus', 'on tests'],
    });
    expect(result).toMatchObject({
      ok: status === 0,
      output: 'LANTERN_SKILL_OK TIDE_STDIN_731',
      agentSessionId: '00000000-0000-4000-8000-000000000002',
      durationMs: 0,
      usage: { input_tokens: 14851, output_tokens: 16 },
    });
    if (status) expect(result.reason).toBe('codex exited with status 1');
    expect(result).not.toHaveProperty('costUsd');
    expect(command).toBe(
      `exec codex exec --json -C '${dir}' -c approval_policy=never -c sandbox_mode=workspace-write ${CODEX_MOUNT} '$session-summary focus on tests' </dev/null >'${runOutput(profilePaths(home, 'default').runs, result.session)}'`,
    );
    const record = testStore(home).get(result.session);
    expect(record).toMatchObject({
      kind: 'run',
      agent: 'codex',
      goal: '$session-summary focus on tests',
      agentSessionId: result.agentSessionId,
    });
    expect(receipt).toBeNull();
    expect(listReceipts(join(home, 'vault'))).toEqual([]);
  }
});

test('a Codex startup failure includes its stderr reason, without a fabricated thread', async () => {
  const world = agentWorld({
    onOpen: finishesRun({ status: 1, stderr: 'Error: No such file or directory (os error 2)' }),
  });
  const { mesa } = setUp(world);
  const { result } = await mesa.sessions.run('session-summary', {
    project: 'lantern-cove',
    agent: 'codex',
  });
  expect(result).toMatchObject({
    ok: false,
    agentSessionId: '',
    durationMs: 0,
    reason: expect.stringContaining('Error: No such file or directory (os error 2)'),
  });
  expect(result.reason).toContain('codex exited with status 1');
});

test('a timed out run releases its queued child before reporting the timeout', async () => {
  const world = agentWorld();
  let child: string | undefined;
  const { home, mesa } = setUp(world, async () => {
    if (child) return;
    const parent = testStore(home).list()[0];
    const queued = await mesa.sessions.open('lantern-cove', { after: parent?.id });
    child = queued.result.id;
    expect(queued.result.lastState.state).toBe('queued');
  });
  await expect(
    mesa.sessions.run('session-summary', { project: 'lantern-cove', timeoutSeconds: 1 }),
  ).rejects.toMatchObject({ code: 'timeout' });
  expect(testStore(home).get(child ?? '').lastState.state).toBe('idle');
  expect(world.tmux.windows.map((w) => w.window)).toEqual([`claude-${child}`]);
});

test('the Board finishes an orphaned run when its waiter and exit hook are gone', async () => {
  const world = agentWorld();
  const { home, mesa } = setUp(world, async () => {
    finishesRun({ output: claudeResult('success') })(world.tmux.windows[0] as FakeWindow);
    throw new Error('mesa run was killed');
  });
  await expect(mesa.sessions.run('session-summary', { project: 'lantern-cove' })).rejects.toThrow(
    'mesa run was killed',
  );
  const [orphan] = testStore(home).list();
  expect(orphan?.endedAt).toBeUndefined();
  const row = (await mesa.sessions.list()).find((r) => r.id === orphan?.id);
  expect(row).toMatchObject({ endedAt: expect.any(String), lastState: { state: 'done' } });
  expect(world.tmux.windows).toEqual([]);
  expect(listReceipts(join(home, 'vault'))).toEqual([]);
});
