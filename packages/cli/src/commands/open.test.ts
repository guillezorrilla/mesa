import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLAUDE_MOUNT, finishesRun, scriptedRunner, testStore } from '@mesa/core/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('open prints the session id, --json the record, and --attach hands back the attach argv', async () => {
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  const dir = join(cli.home, 'src/lantern-cove');
  mkdirSync(dir, { recursive: true });
  await mesa('register', '--create', dir);

  const { json } = await mesa('open', 'lantern-cove', '--json');
  expect(json.data).toMatchObject({
    project: 'lantern-cove',
    agent: 'claude',
    agentSessionId: '00000000-0000-4000-8000-000000000001',
    tmux: { socket: 'mesa-default', session: 'lantern-cove' },
    receipt: null,
  });
  const plain = await mesa('open', 'lantern-cove');
  expect(plain.stdout).toMatch(/^[0-9a-z]{8}\n$/);
  expect(testStore(cli.home).get(plain.stdout.trim()).agentSessionId).toBe(
    '00000000-0000-4000-8000-000000000002',
  );
  expect(plain.exec).toBeUndefined();

  const attached = await mesa('open', 'lantern-cove', '--attach');
  const id = attached.stdout.trim();
  expect(attached.exec).toEqual([
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
    'set-option',
    'destroy-unattached',
    'on',
    ';',
    'select-window',
    '-t',
    expect.stringMatching(new RegExp(`^=_view-[0-9a-z]{8}:=claude-${id}$`)),
  ]);
  expect(await mesa('open', 'tide')).toMatchObject({ code: 3 });
  // Codex picks its own thread id, which a look at the board reads later.
  const codex = (await mesa('open', 'lantern-cove', '--agent', 'codex', '--json')).json.data;
  expect(codex).toMatchObject({ agent: 'codex', tmux: { window: `codex-${codex.id}` } });
  expect(codex).not.toHaveProperty('agentSessionId');
});

test('open --terminal starts a plain shell session with no coding agent conversation', async () => {
  const world = cli.withTmux();
  await cli.withProject({ layOut: false });
  const opened = (await mesa('open', 'lantern-cove', '--terminal', '--json')).json.data;
  expect(opened).toMatchObject({ kind: 'terminal', agent: 'terminal', project: 'lantern-cove' });
  expect(opened.agentSessionId).toBeUndefined();
  expect(world.windows.at(-1)?.launch).toBe("exec '/bin/zsh' -l");
  expect((await mesa('sessions', '--json')).json.data).toEqual([
    expect.objectContaining({
      id: opened.id,
      kind: 'terminal',
      lastState: expect.objectContaining({ state: 'working' }),
    }),
  ]);
  expect(await mesa('send', opened.id, 'hello')).toMatchObject({ code: 2 });
  expect(await mesa('resume', opened.id)).toMatchObject({ code: 2 });
  expect(await mesa('open', 'lantern-cove', '--terminal', '--agent', 'claude')).toMatchObject({
    code: 2,
  });
});

test('open --mode plan reports native Plan in JSON and passes the provider startup flag', async () => {
  const world = cli.withTmux();
  await cli.withProject({ layOut: false });
  const opened = await mesa('open', 'lantern-cove', '--mode', 'plan', '--json');
  expect(opened.json.data.mode).toBe('plan');
  expect(world.windows.at(-1)?.launch).toContain(' --permission-mode plan');
  expect(await mesa('open', 'lantern-cove', '--agent', 'codex', '--mode', 'plan')).toMatchObject({
    code: 2,
  });
});

test('config set agents.* --json validates a launch default, which open then passes', async () => {
  const world = cli.withTmux();
  await cli.withProject({ layOut: false });
  const set = await mesa('config', 'set', 'agents.codex.bypass', 'true', '--json');
  expect(set.json.data).toMatchObject({ path: 'agents.codex.bypass', value: true });
  const refused = await mesa('config', 'set', 'agents.codex.sandbox', 'everything', '--json');
  expect(refused.json.error).toMatchObject({ code: 'invalid_config' });
  const opened = await mesa('open', 'lantern-cove', '--agent', 'codex', '--json');
  expect(world.windows.at(-1)?.launch).toContain(' --dangerously-bypass-approvals-and-sandbox ');
  expect(opened.json.data.receipt).not.toBeNull();
});

test('open --background returns Claude native handle and attaches its terminal view', async () => {
  const world = cli.withTmux();
  await cli.withProject({ layOut: false });
  const base = cli.run;
  cli.run = (file, args, ms, options) =>
    file === 'claude' && args[0] === '--bg'
      ? Promise.resolve({ ok: true, stdout: 'backgrounded · abcdef12\n' })
      : base(file, args, ms, options);
  const opened = await mesa('open', 'lantern-cove', '--background', '--mode', 'plan', '--json');
  expect(opened.json.data).toMatchObject({
    background: true,
    backgroundId: 'abcdef12',
    mode: 'plan',
  });
  expect(world.windows.at(-1)?.launch).toBe('unset NO_COLOR; exec claude attach abcdef12');
  expect(await mesa('open', 'lantern-cove', '--agent', 'codex', '--background')).toMatchObject({
    code: 2,
  });
});

test('open --terminal --parent keeps the child link in JSON', async () => {
  cli.withTmux();
  await cli.withProject({ layOut: false });
  const parent = (await mesa('open', 'lantern-cove', '--json')).json.data;
  const child = (await mesa('open', 'lantern-cove', '--terminal', '--parent', parent.id, '--json'))
    .json.data;
  expect(child).toMatchObject({ parent: parent.id, project: 'lantern-cove', kind: 'terminal' });
});

test('open --general --json starts without a registered project', async () => {
  const world = cli.withTmux();
  await mesa('init', '--vault', 'vault');
  const opened = await mesa('open', '--general', '--json');
  expect(opened.code).toBe(0);
  expect(opened.json.data).toMatchObject({
    project: '__mesa_general__',
    cwd: cli.home,
    tmux: { session: '__mesa_general__' },
  });
  expect(world.windows.at(-1)?.project).toBe('__mesa_general__');
  expect((await mesa('open', '--general', '--terminal', '--json')).json.data).toMatchObject({
    project: '__mesa_general__',
    kind: 'terminal',
    agent: 'terminal',
  });
  expect((await mesa('open', '--json')).code).toBe(2);
  expect((await mesa('open', 'lantern-cove', '--general', '--json')).code).toBe(2);
});

test('open --goal and --goal-file start with a goal; mesa goal prints it', async () => {
  const world = cli.withTmux();
  await cli.withProject({ layOut: false });
  const opened = await mesa('open', 'lantern-cove', '--goal', 'Print the word ready and stop');
  const id = opened.stdout.split('\n')[0] ?? '';
  expect(world.windows.at(-1)?.launch).toBe(
    `unset NO_COLOR; exec claude --session-id 00000000-0000-4000-8000-000000000001 ${CLAUDE_MOUNT} 'Print the word ready and stop'`,
  );
  expect((await mesa('goal', id, '--json')).json).toEqual({
    ok: true,
    data: { id, goal: 'Print the word ready and stop' },
  });
  expect((await mesa('goal', id)).stdout).toBe('Print the word ready and stop\n');

  // A relative --goal-file is read from where mesa runs.
  writeFileSync(join(cli.home, 'goal.md'), 'From a file\n');
  const fromFile = await mesa('open', 'lantern-cove', '--goal-file', 'goal.md', '--json');
  expect(fromFile.json.data.goal).toBe('From a file\n');
  expect(world.windows.at(-1)?.launch).toBe(
    `unset NO_COLOR; exec claude --session-id 00000000-0000-4000-8000-000000000002 ${CLAUDE_MOUNT} 'From a file\n'`,
  );

  const plain = (await mesa('open', 'lantern-cove')).stdout.split('\n')[0] ?? '';
  expect(await mesa('goal', plain)).toMatchObject({
    code: 3,
    stderr: `session ${plain} has no goal\n`,
  });
  expect(await mesa('open', 'lantern-cove', '--goal', '')).toMatchObject({
    code: 2,
    stderr: 'the goal is empty\n',
  });
});

test('open inside a session makes a child; sessions --tree indents it; --json names the links', async () => {
  cli.withTmux();
  await cli.withProject({ layOut: false });
  const a = (await mesa('open', 'lantern-cove', '--json')).json.data.id;
  cli.env = { MESA_SESSION_ID: a, MESA_PROFILE: 'default' };
  const child = (await mesa('open', 'lantern-cove', '--json')).json.data;
  expect(child.parent).toBe(a);
  const loose = (await mesa('open', 'lantern-cove', '--no-parent', '--json')).json.data;
  expect(loose.parent).toBeUndefined();
  expect(await mesa('open', 'lantern-cove', '--parent', 'zzzzzzzz')).toMatchObject({
    code: 3,
    stderr: 'no session zzzzzzzz to be the parent; see mesa sessions, or pass --no-parent\n',
  });

  const tree = (await mesa('sessions', '--tree')).stdout.split('\n').filter(Boolean);
  const at = (id: string) => tree.findIndex((line) => line.trimStart().startsWith(id));
  expect(tree[at(child.id)]).toMatch(new RegExp(`^  ${child.id} `));
  expect(at(child.id)).toBe(at(a) + 1);
  expect(tree[at(loose.id)]).toMatch(new RegExp(`^${loose.id} `));

  const rows = (await mesa('sessions', '--json')).json.data;
  const links = Object.fromEntries(
    rows.map((r: { id: string; parent?: string; children: string[] }) => [
      r.id,
      [r.parent ?? null, r.children],
    ]),
  );
  expect(links).toEqual({ [a]: [null, [child.id]], [child.id]: [a, []], [loose.id]: [null, []] });
  const treeRows = (await mesa('sessions', '--tree', '--json')).json.data;
  expect(treeRows.map((r: { depth: number }) => r.depth).sort()).toEqual([0, 0, 1]);
});

describe('open --after queues a session until the one it waits on is over', () => {
  /** A profile with lantern-cove, claude, and a fake tmux; `window(id)` is a session's window. */
  async function queueWorld() {
    const world = cli.withTmux();
    await cli.withProject();
    const window = (id: string) => world.windows.find((w) => w.window === `claude-${id}`);
    const open = async (...flags: string[]) =>
      (await mesa('open', 'lantern-cove', ...flags, '--json')).json.data;
    const state = async (id: string) =>
      (await mesa('show', id, '--json')).json.data.lastState.state;
    /** The agent in `id`'s window exits, its pane dead, as tmux sees it. */
    const exit = (id: string) => {
      const w = window(id);
      if (w) w.dead = true;
    };
    return { world, window, open, state, exit };
  }

  /** Claude Code's SessionEnd payload from the session `a`. */
  const sessionEnd = (a: { agentSessionId: string }, reason: string) =>
    JSON.stringify({ hook_event_name: 'SessionEnd', session_id: a.agentSessionId, reason });

  test('a queued record waits on its session, with no window, and its parent by default', async () => {
    const { world, open, window } = await queueWorld();
    const a = await open();
    const b = await open('--after', a.id, '--goal', 'Say second', '--branch', 'second');
    expect(b).toMatchObject({
      after: a.id,
      parent: a.id,
      goal: 'Say second',
      pending: { branch: 'second' },
      lastState: { state: 'queued', confidence: 1, source: 'mesa' },
    });
    expect(b.agentSessionId).toBeUndefined();
    expect(window(b.id)).toBeUndefined();
    expect(world.windows).toHaveLength(1);
    const listed = await mesa('sessions');
    expect(listed.stdout).toMatch(
      new RegExp(`${b.id} +lantern-cove \\(second\\) +claude +queued .*waiting on ${a.id}`),
    );
    const row = (await mesa('sessions', '--json')).json.data.find(
      (r: { id: string }) => r.id === b.id,
    );
    expect(row).toMatchObject({ attention: 0, runningSeconds: 0, alive: false });
    expect(row.decision).toBeUndefined();
    // --no-parent and --parent still win over the default.
    expect((await open('--after', a.id, '--no-parent')).parent).toBeUndefined();
    expect(await mesa('open', 'lantern-cove', '--after', 'zzzzzzzz')).toMatchObject({ code: 3 });
  });

  test('--after a session that is over starts at once', async () => {
    const { open, exit, window } = await queueWorld();
    const a = await open();
    exit(a.id);
    await mesa('sessions');
    const b = await open('--after', a.id);
    expect(b).toMatchObject({ after: a.id, parent: a.id, lastState: { state: 'idle' } });
    expect(window(b.id)).toBeDefined();
  });

  test('SessionEnd through mesa hook claude starts it; a /clear does not', async () => {
    const { open, window, state } = await queueWorld();
    const a = await open();
    const b = await open('--after', a.id, '--goal', 'Say second');
    cli.env = { MESA_SESSION_ID: a.id, MESA_PROFILE: 'default' };
    cli.stdin = sessionEnd(a, 'clear');
    await mesa('hook', 'claude');
    expect(window(b.id)).toBeUndefined();
    cli.stdin = sessionEnd(a, 'prompt_input_exit');
    expect(await mesa('hook', 'claude', '--json')).toMatchObject({
      code: 0,
      json: { data: { recorded: true, event: 'SessionEnd' } },
    });
    cli.env = {};
    // Through open's path: mesa-vault and its goal as the first prompt, in a window with its own id.
    expect(window(b.id)?.launch).toContain(
      `claude --session-id ${(await mesa('show', b.id, '--json')).json.data.agentSessionId} ${CLAUDE_MOUNT} 'Say second'`,
    );
    expect(await state(b.id)).toBe('idle');
  });

  test('pane-died through mesa hook tmux starts it', async () => {
    const { open, window, exit } = await queueWorld();
    const a = await open();
    const b = await open('--after', a.id);
    exit(a.id);
    await mesa('hook', 'tmux', 'pane-died', 'lantern-cove', `claude-${a.id}`);
    expect(window(b.id)).toBeDefined();
    const shown = (await mesa('show', b.id, '--json')).json.data;
    expect(shown).toMatchObject({ alive: true, agentSessionId: expect.any(String) });
    expect(shown.pending).toBeUndefined();
  });

  test('a look that finds it over starts it, when no signal did', async () => {
    const { open, window, exit, state } = await queueWorld();
    const a = await open();
    const b = await open('--after', a.id);
    exit(a.id);
    const rows = (await mesa('sessions', '--json')).json.data;
    expect(window(b.id)).toBeDefined();
    // The look shows it started, not the queue it found.
    expect(rows.find((r: { id: string }) => r.id === b.id).lastState.state).not.toBe('queued');
    expect(await state(a.id)).toBe('done');
  });

  test('mesa show of a queued session whose look starts it shows it started', async () => {
    const { open, exit } = await queueWorld();
    const a = await open();
    const b = await open('--after', a.id);
    exit(a.id);
    const shown = (await mesa('show', b.id, '--json')).json.data;
    expect(shown.lastState.state).not.toBe('queued');
    expect(shown.pending).toBeUndefined();
    expect(shown.alive).toBe(true);
  });

  test('two signals at once start it once', async () => {
    const { world, open, exit } = await queueWorld();
    const a = await open();
    const b = await open('--after', a.id);
    exit(a.id);
    cli.stdin = sessionEnd(a, 'other');
    const hook = mesa('hook', 'tmux', 'pane-died', 'lantern-cove', `claude-${a.id}`);
    cli.env = { MESA_SESSION_ID: a.id, MESA_PROFILE: 'default' };
    await Promise.all([hook, mesa('hook', 'claude'), mesa('sessions')]);
    cli.env = {};
    expect(world.windows.filter((w) => w.window === `claude-${b.id}`)).toHaveLength(1);
    const receipts = (await mesa('receipts', '--json', '--limit', '50')).json.data;
    const started = receipts.filter((e: { summary: string }) =>
      e.summary.startsWith(`Started queued session ${b.id}`),
    );
    expect(started).toHaveLength(0);
  });

  test('a chain of three runs in order', async () => {
    const { open, window, exit, state } = await queueWorld();
    const a = await open();
    const b = await open('--after', a.id);
    const c = await open('--after', b.id);
    exit(a.id);
    await mesa('hook', 'tmux', 'pane-died', 'lantern-cove', `claude-${a.id}`);
    expect(window(b.id)).toBeDefined();
    expect(window(c.id)).toBeUndefined();
    expect(await state(c.id)).toBe('queued');
    exit(b.id);
    await mesa('hook', 'tmux', 'pane-died', 'lantern-cove', `claude-${b.id}`);
    expect(window(c.id)).toBeDefined();
  });

  test('mesa stop cancels a queued session; what waited on it waits on its session instead', async () => {
    const { open, window, exit } = await queueWorld();
    const a = await open();
    const b = await open('--after', a.id);
    const c = await open('--after', b.id);
    // Removed, it would leave C waiting on nothing: rm refuses until it is cancelled.
    expect(await mesa('rm', b.id)).toMatchObject({ code: 2 });
    const stopped = await mesa('stop', b.id, '--json');
    expect(stopped.json.data).toMatchObject({
      outcome: 'cancelled',
      lastState: { state: 'stopped', confidence: 1, source: 'mesa' },
      endedAt: expect.any(String),
    });
    expect((await mesa('stop', b.id)).stdout).toContain('had already ended');
    expect((await mesa('show', c.id, '--json')).json.data).toMatchObject({
      after: a.id,
      parent: b.id,
      lastState: { state: 'queued' },
    });
    // A still runs, so nothing started.
    expect(window(c.id)).toBeUndefined();
    exit(a.id);
    await mesa('hook', 'tmux', 'pane-died', 'lantern-cove', `claude-${a.id}`);
    expect(window(b.id)).toBeUndefined();
    expect(window(c.id)).toBeDefined();
    // A cancelled session never ran: nothing to resume, and now it can go.
    expect(await mesa('resume', b.id)).toMatchObject({ code: 3 });
    expect(await mesa('rm', b.id)).toMatchObject({ code: 0 });
  });

  test('a queued session that cannot start says why in the stop, and ends failed', async () => {
    const { world, open, window, state } = await queueWorld();
    const a = await open();
    const b = await open('--after', a.id);
    // claude is gone by the time A stops.
    cli.run = scriptedRunner({ tmux: world.answer }, { missing: ['claude'] }).run;
    const stopped = await mesa('stop', a.id, '--force', '--json');
    expect(stopped.code).toBe(0);
    expect(stopped.json.data.warning).toContain(`queued session ${b.id} did not start`);
    expect(window(b.id)).toBeUndefined();
    expect(await state(b.id)).toBe('failed');
  });

  test('stopping the session it waits on starts it', async () => {
    const { open, window } = await queueWorld();
    const a = await open();
    const b = await open('--after', a.id);
    await mesa('stop', a.id, '--force');
    expect(window(b.id)).toBeDefined();
  });
});

test.each(['open', 'resume', 'handoff'] as const)(
  '%s surfaces Codex trust warnings in text and JSON',
  async (action) => {
    cli.withTmux();
    await cli.withProject({ layOut: false });
    const note = join(cli.home, 'handoff.md');
    writeFileSync(note, '## Verified\nInvented handoff.\n');
    await mesa('hooks', 'install');
    const warning =
      "Review and trust Mesa's hooks in Codex; this session starts without the Mesa pointer";
    const start = async (json: boolean) => {
      let args: string[];
      if (action === 'open')
        args = ['open', 'lantern-cove', '--agent', 'codex', '--goal', 'Read files'];
      else {
        const seed = (
          await mesa('open', 'lantern-cove', '--agent', 'codex', '--goal', 'Read files', '--json')
        ).json.data;
        testStore(cli.home).update(seed.id, {
          agentSessionId: '11111111-2222-4333-8444-555555555555',
        });
        if (action === 'resume') {
          await mesa('stop', seed.id);
          args = ['resume', seed.id];
        } else args = ['handoff', seed.id, '--note', note, '--agent', 'codex'];
      }
      return mesa(...args, ...(json ? ['--json'] : []));
    };
    for (const json of [false, true]) {
      const out = await start(json);
      expect(out.code).toBe(0);
      if (json) expect(out.json.data.warning).toBe(warning);
      else expect(out.stdout).toContain(`warning: ${warning}`);
    }
    const path = realpathSync(join(cli.home, '.codex/hooks.json'));
    writeFileSync(
      join(cli.home, '.codex/config.toml'),
      `[hooks.state.${JSON.stringify(`${path}:session_start:0:0`)}]\ntrusted_hash = "sha256:invented"\n`,
    );
    for (const json of [false, true]) {
      const out = await start(json);
      expect(out.code).toBe(0);
      if (json) expect(out.json.data.warning).toBeUndefined();
      else expect(out.stdout).not.toContain(warning);
    }
  },
);

test('open --from starts from an imported item, imports a new link first, and sessions --json shows the item', async () => {
  const SITE = 'https://lantern-cove.atlassian.net';
  const { world, agent } = await cli.withImports();
  world.serveIssue('LC-12', { summary: 'Fix the tide alarm', description: '<p>Late.</p>' });
  world.servePage('9001', { title: 'Tide schedule', html: '<p>Twice a day.</p>' });
  await mesa('import', 'LC-12', '--project', 'lantern-cove');

  const built = await mesa('import', 'goal', 'LC-12', '--project', 'lantern-cove', '--json');
  const opened = await mesa(
    'open',
    'lantern-cove',
    '--from',
    'LC-12',
    '--goal',
    'Fix it.',
    '--json',
  );
  expect(opened.json.data).toMatchObject({
    goal: `${built.json.data.goal}\n\nFix it.`,
    from: { source: 'jira', id: 'LC-12' },
  });
  expect(built.json.data.goal).toContain('- Note: wiki/notes/lc-12-fix-the-tide-alarm.md');
  expect((await mesa('goal', opened.json.data.id)).stdout).toContain(
    'Work on the imported Jira issue LC-12: Fix the tide alarm',
  );

  const page = `${SITE}/wiki/spaces/LC/pages/9001`;
  const fresh = await mesa('open', 'lantern-cove', '--from', page, '--no-notes', '--json');
  expect(fresh.json.data.from).toEqual({ source: 'confluence', id: '9001' });
  expect(fresh.json.data.goal).not.toContain('- Note:');
  const edited = await mesa(
    'open',
    'lantern-cove',
    '--from',
    'LC-12',
    '--exact-goal',
    '--goal',
    'Only the alarm.',
    '--json',
  );
  expect(edited.json.data).toMatchObject({ goal: 'Only the alarm.', from: { id: 'LC-12' } });

  const rows = (await mesa('sessions', '--json')).json.data;
  expect(
    rows.filter((r: { from?: unknown }) => r.from).map((r: { from: unknown }) => r.from),
  ).toEqual(
    expect.arrayContaining([
      { source: 'jira', id: 'LC-12' },
      { source: 'confluence', id: '9001' },
    ]),
  );

  const both = await mesa(
    'open',
    'lantern-cove',
    '--from',
    'LC-12',
    '--goal-file',
    'g.md',
    '--json',
  );
  expect(both.json.error).toEqual({
    code: 'usage',
    message: 'pass --from or --goal-file, not both',
  });
  const missing = await mesa('open', 'lantern-cove', '--from', `${SITE}/browse/LC-404`, '--json');
  expect(missing.code).toBe(3);
  expect(missing.json.error.message).toBe('Jira issue LC-404 is missing, or not shared with you');
  expect(await mesa('open', 'lantern-cove', '--exact-goal', '--json')).toMatchObject({ code: 2 });

  // A new link whose notes run fails still starts, and both outputs say why.
  world.servePage('9002', { title: 'Harbour', html: '<p>Boats.</p>' });
  const failing = finishesRun({ output: '', status: 1, stderr: 'claude: not logged in' });
  agent((w) => {
    if (w.launch.includes('/import-notes')) failing(w);
  });
  const warned = await mesa('open', 'lantern-cove', '--from', `${SITE}/wiki/spaces/LC/pages/9002`);
  expect(warned.code).toBe(0);
  expect(warned.stdout).toMatch(
    /^[0-9a-z]{8}\nwarning: notes not written for 9002 \(claude printed no result/,
  );
});
