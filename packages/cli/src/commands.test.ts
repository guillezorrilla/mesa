import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Runner } from '@mesa/core';
import {
  fakeTmux,
  newSession,
  scriptedRunner,
  sequentialIds,
  sequentialUuids,
  tempDir,
  testDeps,
} from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { runCli, VERSION } from './cli.js';
import { COMMANDS } from './commands/index.js';

// Every real command through runCli, against a temp home: nothing here touches the real HOME.
let home: string;
let run: Runner;
let newId = sequentialIds();
let newUuid = sequentialUuids();
/** Whether the next invocations run in a terminal. */
let tty = true;
/** What the next invocations read on stdin. */
let stdin = '';
/** The environment of the next invocations (MESA_SESSION_ID for a hook). */
let env: Record<string, string> = {};
beforeEach(() => {
  home = tempDir();
  newId = sequentialIds(); // one id source per test, shared by its invocations
  newUuid = sequentialUuids();
  tty = true;
  stdin = '';
  env = {};
  run = scriptedRunner({ tmux: 'tmux 3.7c', claude: '2.1.282 (Claude Code)' }).run;
});
const mesa = async (...argv: string[]) => {
  const out = await runCli(argv, {
    commands: COMMANDS,
    env: {},
    tty,
    stdin: async () => stdin,
    mesa: testDeps(home, { run, argv, newId, newUuid, env }),
  });
  return { ...out, json: out.stdout.startsWith('{') ? JSON.parse(out.stdout) : undefined };
};

test('init, then a second init, then a second profile', async () => {
  const first = (await mesa('init', '--vault', 'vault')).stdout;
  expect(first.split('\n')[0]).toBe(
    `initialised profile default at ${home}/.mesa/default/config.yaml`,
  );
  // The receipt is written; its log.md line waits for mesa vault init.
  expect(first).toContain(
    `warning: no log line: ${home}/vault/log.md not found; run mesa vault init`,
  );
  expect(readFileSync(join(home, '.mesa/default/config.yaml'), 'utf8')).toContain(
    `vault: ${home}/vault`,
  );
  expect((await mesa('init', '--vault', 'vault')).stdout).toBe(
    'profile default already initialised\n',
  );
  expect((await mesa('--profile', 'work', 'init', '--vault', '/tmp/w')).code).toBe(0);
  expect(await mesa('init')).toMatchObject({
    code: 2,
    stderr: '--vault is required. Usage: mesa init --vault <string> [flags]\n',
  });
});

test('config prints redacted, config set writes one field', async () => {
  await mesa('init', '--vault', '/tmp/v');
  expect((await mesa('config', 'set', 'keys.jev', 'env:JEV')).stdout).toBe('keys.jev = "***"\n');
  expect((await mesa('config', 'set', 'defaultAgent', 'codex')).stdout).toBe(
    'defaultAgent = "codex"\n',
  );
  const { json } = await mesa('config', '--json');
  expect(json.data).toMatchObject({ vault: '/tmp/v', defaultAgent: 'codex', keys: { jev: '***' } });
  expect((await mesa('config', 'set', 'decisions.threshold', '3')).code).toBe(4);
  expect((await mesa('config', 'set', 'onlypath')).code).toBe(2);
  expect((await mesa('--profile', 'none', 'config')).code).toBe(3);
});

test('register, projects, unregister', async () => {
  await mesa('init', '--vault', '/tmp/v');
  mkdirSync(join(home, 'lantern-cove'));
  expect((await mesa('register', 'lantern-cove')).code).toBe(3);
  expect((await mesa('register', 'lantern-cove', '--create')).stdout.split('\n')[0]).toBe(
    `registered lantern-cove at ${home}/lantern-cove (wrote mesa.yaml)`,
  );
  expect((await mesa('register', 'lantern-cove')).code).toBe(4);
  const { json } = await mesa('projects', '--json');
  expect(json.data).toEqual([
    {
      name: 'lantern-cove',
      path: `${home}/lantern-cove`,
      agent: 'claude',
      priority: 0.5,
      skills: [],
      exists: true,
    },
  ]);
  expect((await mesa('projects')).stdout).toBe(`lantern-cove  ${home}/lantern-cove  claude  0.5\n`);
  expect((await mesa('unregister', 'lantern-cove')).stdout).toBe('unregistered lantern-cove\n');
  expect((await mesa('projects')).stdout).toBe(
    'no projects registered; run mesa register <path>\n',
  );
});

test('doctor reports { healthy, checks } and exits 3 when unhealthy', async () => {
  const healthy = await mesa('doctor', '--json');
  expect(healthy.code).toBe(0);
  expect(healthy.json.data.healthy).toBe(true);
  expect(healthy.json.data.checks.map((c: { name: string }) => c.name)).toEqual([
    'tmux',
    'claude',
    'codex',
    'obsidian',
    'profile dir',
  ]);

  run = scriptedRunner({}, { missing: ['tmux', 'claude', 'codex'] }).run;
  const sick = await mesa('doctor');
  expect(sick.code).toBe(3);
  expect(sick.stdout).toMatch(/^FAIL {2}tmux/);
  expect(sick.stdout).toMatch(/\nFAIL {2}claude/);
  expect(sick.stdout).toContain('doctor: tmux and at least one agent');
});

test('vault init lays out the vault once; vault status finds what is missing', async () => {
  await mesa('init', '--vault', 'vault');
  // mesa init already wrote its receipt, so receipts/ exists and vault init adds the rest.
  expect((await mesa('vault', 'init')).stdout).toBe(
    `created log.md, AGENTS.md, index.md, raw, wiki, projects, daily in ${home}/vault\n`,
  );
  const log = readFileSync(join(home, 'vault/log.md'), 'utf8').split('\n');
  expect(log[0]).toBe('- 2026-09-24T12:00:00.000Z vault initialised by mesa');
  // vault init's own receipt, linked from the log.
  expect(log[1]).toMatch(
    /^- 2026-09-24T12:00:00\.000Z Laid out the vault: .* \[\[receipts\/2026\/09\/20260924T120000Z-action-01TEST\d+\|receipt\]\]$/,
  );
  expect((await mesa('vault', 'init')).stdout).toBe('vault already initialised\n');
  expect((await mesa('vault', 'status', '--json')).json.data).toEqual({
    path: `${home}/vault`,
    ok: true,
    missing: [],
  });

  rmSync(join(home, 'vault/receipts'), { recursive: true });
  const status = await mesa('vault', 'status', '--json');
  expect(status.code).toBe(3);
  expect(status.json.data).toMatchObject({ ok: false, missing: ['receipts'] });

  const group = await mesa('vault');
  expect(group.code).toBe(2);
  expect(group.stderr).toContain('vault init');
  expect(group.stderr).toContain('vault status');
});

test('vault init refuses a non-empty folder that is not a vault unless --force', async () => {
  mkdirSync(join(home, 'repo'));
  writeFileSync(join(home, 'repo/README.md'), 'a repo\n');
  await mesa('init', '--vault', 'repo');
  expect((await mesa('vault', 'init')).code).toBe(4);
  expect((await mesa('vault', 'init', '--force')).code).toBe(0);
  expect(readFileSync(join(home, 'repo/README.md'), 'utf8')).toBe('a repo\n');
});

test('log appends to log.md and to the daily note it creates', async () => {
  await mesa('init', '--vault', 'vault');
  expect((await mesa('log', 'hello')).code).toBe(3); // the vault is not laid out yet
  await mesa('vault', 'init');
  const out = await mesa('log', 'hello', '--json');
  expect(out.code).toBe(0);
  expect(out.json.data.entry).toBe('- 2026-09-24T12:00:00.000Z hello');
  expect(readFileSync(join(home, 'vault/log.md'), 'utf8').trimEnd().split('\n').at(-1)).toBe(
    '- 2026-09-24T12:00:00.000Z hello',
  );
  const daily = readFileSync(join(home, 'vault', out.json.data.daily), 'utf8');
  expect(daily).toMatch(/^---\ncreated: /);
  expect(daily.trimEnd().endsWith('- 2026-09-24T12:00:00.000Z hello')).toBe(true);
  expect((await mesa('log')).code).toBe(2);
});

test('init, register, and vault init each leave an action receipt; receipts lists and shows them', async () => {
  await mesa('init', '--vault', 'vault');
  mkdirSync(join(home, 'tide'));
  await mesa('register', 'tide', '--create');
  await mesa('vault', 'init');
  await mesa('vault', 'init'); // nothing to do: no receipt

  const listed = await mesa('receipts', '--json', '--limit', '20');
  const kinds = listed.json.data.map(
    (e: { receipt: { type: string; command: string } }) => e.receipt,
  );
  expect(kinds.map((r: { type: string }) => r.type)).toEqual(['action', 'action', 'action']);
  expect(kinds.map((r: { command: string }) => r.command).sort()).toEqual([
    'mesa init --vault vault',
    'mesa register tide --create',
    'mesa vault init',
  ]);
  const first = listed.json.data[0];
  expect(first.receipt).toMatchObject({
    profile: 'default',
    status: 'ok',
    id: expect.stringMatching(/^01TEST/),
  });

  const shown = await mesa('receipts', 'show', first.receipt.id, '--json');
  expect(shown.json.data.receipt).toEqual(first.receipt);
  expect((await mesa('receipts', 'show', '01NOPE')).code).toBe(3);
  expect((await mesa('receipts', '--limit', 'zero')).code).toBe(2);
  expect((await mesa('receipts', '--limit', '1', '--json')).json.data).toHaveLength(1);
});

test('a vault path that is not a vault gets no receipt, only a warning; a failed register is recorded', async () => {
  mkdirSync(join(home, 'repo/.git'), { recursive: true });
  writeFileSync(join(home, 'repo/README.md'), 'a repo\n');
  const out = await mesa('init', '--vault', 'repo');
  expect(out.code).toBe(0);
  expect(out.stdout).toContain(
    `warning: no receipt: ${home}/repo is not a vault; run mesa vault init`,
  );
  expect(() => readFileSync(join(home, 'repo/receipts'))).toThrow();
  const json = await mesa('--profile', 'json', 'init', '--vault', 'repo', '--json');
  expect(json.json.data).toMatchObject({
    receipt: null,
    warning: expect.stringContaining('is not a vault'),
  });

  await mesa('--profile', 'work', 'init', '--vault', 'vault');
  mkdirSync(join(home, 'nomesa'));
  expect((await mesa('--profile', 'work', 'register', 'nomesa')).code).toBe(3);
  const listed = await mesa('--profile', 'work', 'receipts', '--json');
  const failed = listed.json.data.find(
    (e: { receipt: { status: string } }) => e.receipt.status === 'failed',
  );
  expect(failed.receipt.outputs.error.code).toBe('not_found');
  expect(failed.summary).toBe(`Could not register ${home}/nomesa`);
});

test('a receipt problem never changes the outcome of the action it records', async () => {
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  mkdirSync(join(home, 'tide'));
  chmodSync(join(home, 'vault/log.md'), 0o000); // acceptsMesaWrites cannot read the log mark
  try {
    const ok = await mesa('register', 'tide', '--create');
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain('registered tide');
    expect(ok.stdout).toContain('warning: no receipt:');
    const missing = await mesa('register', 'nowhere');
    expect(missing.code).toBe(3); // the real error, not the receipt's
  } finally {
    chmodSync(join(home, 'vault/log.md'), 0o644);
  }
});

test('vault open: the URI by default, --json, and its errors', async () => {
  expect((await mesa('vault', 'open')).code).toBe(4); // no profile, so no vault configured
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  const list = join(home, 'obsidian/obsidian.json');
  mkdirSync(join(home, 'obsidian'), { recursive: true });
  writeFileSync(list, JSON.stringify({ vaults: { a1: { path: join(home, 'vault'), ts: 1 } } }));

  const opened = await mesa('vault', 'open', '--json');
  expect(opened.json).toEqual({
    ok: true,
    data: { opened: true, method: 'uri', target: 'obsidian://open?vault=vault' },
  });
  const { daily } = (await mesa('log', 'hello', '--json')).json.data;
  const note = await mesa('vault', 'open', daily, '--json');
  expect(note.json.data.target).toBe(
    `obsidian://open?vault=vault&file=${encodeURIComponent(daily)}`,
  );
  expect((await mesa('vault', 'open', 'wiki/missing.md')).code).toBe(3);
});

test('decide answers the questions on stdin, rules first, then the adapter; doctor names it', async () => {
  // Before init there is nothing configured: rules answer.
  stdin = JSON.stringify({ questions: [{ kind: 'Noul', id: 'x', statement: 'It holds' }] });
  expect((await mesa('decide')).stdout).toBe('x  Noul  false  p 0.50\nbackend rules\n');
  await mesa('init', '--vault', 'vault');
  stdin = JSON.stringify({
    state: { anything: true },
    questions: [
      { kind: 'Choice', id: 'route', options: ['ingest', 'ask'] },
      { kind: 'Score', id: 'urgency', levels: ['low', 'medium', 'high'] },
      { kind: 'Noul', id: 'destructive', statement: 'The prompt deletes files' },
    ],
  });
  // No rules know these questions, so they are even and unsure: the adapter (the default) is
  // asked. Its `claude -p` result here is invented, shaped like a recorded one.
  const structured = {
    route: { answer: 'ask', probabilities: { ingest: 0.2, ask: 0.8 }, confidence: 0.8 },
    urgency: { answer: 'high', probabilities: { low: 0, medium: 0.4, high: 0.6 }, confidence: 0.7 },
    destructive: { answer: false, confidence: 0.9 },
  };
  const result = {
    type: 'result',
    subtype: 'success',
    is_error: false,
    structured_output: structured,
    total_cost_usd: 0.0021,
  };
  run = scriptedRunner({
    claude: (args) => (args[0] === '-p' ? JSON.stringify(result) : '[]'),
  }).run;
  expect((await mesa('decide')).stdout).toBe(
    [
      'route        Choice  ask    confidence 0.80',
      'urgency      Score   0.80   confidence 0.70',
      'destructive  Noul    false  p 0.10',
      'backend adapter (list price $0.0021)',
      '',
    ].join('\n'),
  );
  const { json } = await mesa('decide', '--json');
  expect(json.data).toMatchObject({
    backend: 'adapter',
    costUsd: 0.0021,
    at: '2026-09-24T12:00:00.000Z',
    latencyMs: 0,
  });
  // A claude that cannot answer: the even rules stand, marked as a fallback.
  run = scriptedRunner({}, { missing: ['claude'] }).run;
  expect((await mesa('decide')).stdout).toContain('backend rules-fallback\n');
  expect(json.data.answers).toHaveLength(3);

  stdin = 'not json';
  expect(await mesa('decide')).toMatchObject({
    code: 2,
    stderr: expect.stringContaining('stdin is not JSON'),
  });
  stdin = JSON.stringify({ questions: [{ kind: 'Choice', id: 'a', options: ['only'] }] });
  expect(await mesa('decide')).toMatchObject({
    code: 2,
    stderr: expect.stringContaining('invalid questions: 0.options'),
  });

  // The profile names adapter (the default): doctor says rules come first.
  const { json: report } = await mesa('doctor', '--json');
  expect(report.data.checks).toContainEqual({
    name: 'decisions',
    ok: true,
    status: 'ok',
    version: 'adapter',
    hint: 'rules first; adapter below confidence 0.7',
  });
});

test('sessions lists the records with live tmux; a fresh profile is empty', async () => {
  await mesa('init', '--vault', 'vault');
  expect((await mesa('sessions', '--json')).json).toEqual({ ok: true, data: [] });
  expect((await mesa('sessions')).stdout).toBe('no sessions; run mesa open <project>\n');

  const record = (id: string, project: string, startedAt: string, extra = {}) => ({
    id,
    ...newSession({ project, startedAt, ...extra }),
    tmux: { socket: 'mesa-default', session: project, window: `claude-${id.slice(0, 6)}` },
    events: [],
  });
  const dir = join(home, '.mesa/default/sessions');
  const save = (r: { id: string }) => writeFileSync(join(dir, `${r.id}.json`), JSON.stringify(r));
  save(record('aaaaaaaa', 'lantern-cove', '2026-09-24T11:00:00.000Z'));
  save(
    // Stopped two days ago: off the board, but shown with --all.
    record('bbbbbbbb', 'tide', '2026-09-22T10:00:00.000Z', { endedAt: '2026-09-22T10:10:00.000Z' }),
  );
  save(record('cccccccc', 'harbor', '2026-09-24T11:59:18.000Z'));
  // tmux still has lantern-cove's window, showing a finished reply; harbor's is gone.
  const screen = ['⏺ Wrote tide-tables.md', '', '─────', '❯', '─────'].join('\n');
  run = scriptedRunner({
    tmux: (args) =>
      args.includes('capture-pane')
        ? screen
        : 'lantern-cove\t0\tclaude-aaaaaa\t4242\t2.1.282\t/src/lantern-cove\t1790359178\t0\n',
  }).run;

  const { json } = await mesa('sessions', '--json');
  expect(json.data.map((s: { id: string; alive: boolean }) => [s.id, s.alive])).toEqual([
    ['aaaaaaaa', true],
    ['cccccccc', false],
  ]);
  expect(json.data[1].lastState).toMatchObject({ state: 'done', source: 'tmux' });
  expect((await mesa('sessions', '--all')).stdout).toBe(
    [
      // By attention: the live one (its screen reads idle, 60%), the vanished one, the stopped one.
      'aaaaaaaa  lantern-cove  claude  idle     60%  0.33  1h00m   ⏺ Wrote tide-tables.md',
      'cccccccc  harbor        claude  done     85%  0.25  42s',
      'bbbbbbbb  tide          claude  working  95%  0.00  10m00s',
      '',
    ].join('\n'),
  );
});

test('sessions shows agent sessions Mesa did not start; stop, send, resume refuse them', async () => {
  await mesa('init', '--vault', 'vault');
  mkdirSync(join(home, 'src/lantern-cove'), { recursive: true });
  await mesa('register', '--create', join(home, 'src/lantern-cove'));
  // A claude started in a plain terminal in the project, as `claude agents --json` lists it.
  const listing = [
    {
      pid: 4242,
      cwd: join(home, 'src/lantern-cove'),
      kind: 'interactive',
      startedAt: Date.parse('2026-09-24T11:58:00.000Z'),
      sessionId: '00000000-0000-4000-8000-00000000000e',
      name: 'lantern-cove-12',
      status: 'idle',
    },
  ];
  run = scriptedRunner({ claude: JSON.stringify(listing) }).run;
  expect((await mesa('sessions')).stdout).toBe(
    'ext-4242  lantern-cove  claude  idle  85%  0.33  2m00s  not managed by mesa\n',
  );
  // --json carries the Decision behind each row, with its probabilities.
  expect((await mesa('sessions', '--json')).json.data).toMatchObject([
    {
      attention: expect.closeTo(1 / 3, 6),
      decision: {
        backend: 'rules',
        answers: [
          { id: 'state', answer: 'idle', probabilities: { idle: expect.closeTo(0.85, 6) } },
          { id: 'attention', probabilities: { low: expect.closeTo(2 / 3, 6) } },
          { id: 'human', answer: false, probabilities: expect.closeTo(0.06, 6) },
        ],
      },
      id: 'ext-4242',
      managed: false,
      agent: 'claude',
      pid: 4242,
      cwd: join(home, 'src/lantern-cove'),
      agentSessionId: '00000000-0000-4000-8000-00000000000e',
      startedAt: '2026-09-24T11:58:00.000Z',
      project: 'lantern-cove',
      alive: true,
      agentStatus: 'idle',
      lastState: {
        state: 'idle',
        confidence: 0.85,
        at: '2026-09-24T12:00:00.000Z',
        source: 'listing',
      },
      runningSeconds: 120,
    },
  ]);
  for (const argv of [
    ['stop', 'ext-4242'],
    ['send', 'ext-4242', 'hi'],
    ['resume', 'ext-4242'],
    ['attach', 'ext-4242'],
  ]) {
    expect(await mesa(...argv), argv[0]).toMatchObject({
      code: 3,
      stderr: 'ext-4242: session not managed by mesa\n',
    });
  }
  const { json } = await mesa('stop', 'ext-4242', '--json');
  expect(json.error).toEqual({
    code: 'not_found',
    message: 'ext-4242: session not managed by mesa',
  });

  // Another profile's session is that board's, not a foreign one here.
  const work = join(home, '.mesa/work/sessions');
  mkdirSync(work, { recursive: true });
  const theirs = { id: 'wwwwwwww', ...newSession(), events: [] };
  writeFileSync(
    join(work, 'wwwwwwww.json'),
    JSON.stringify({ ...theirs, agentSessionId: '00000000-0000-4000-8000-00000000000e' }),
  );
  expect((await mesa('sessions', '--json')).json.data).toEqual([]);
  rmSync(join(work, 'wwwwwwww.json'));

  // The process exits: the listing no longer names it, and its row is gone.
  run = scriptedRunner({ claude: '[]' }).run;
  expect((await mesa('sessions')).stdout).toBe('no sessions; run mesa open <project>\n');
});

test('open prints the session id, --json the record, and --attach hands back the attach argv', async () => {
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  const dir = join(home, 'src/lantern-cove');
  mkdirSync(dir, { recursive: true });
  await mesa('register', '--create', dir);

  const { json } = await mesa('open', 'lantern-cove', '--json');
  expect(json.data).toMatchObject({
    project: 'lantern-cove',
    agent: 'claude',
    agentSessionId: '00000000-0000-4000-8000-000000000001',
    tmux: { socket: 'mesa-default', session: 'lantern-cove' },
    receipt: { id: expect.stringMatching(/^01TEST/) },
  });
  const plain = await mesa('open', 'lantern-cove');
  expect(plain.stdout).toMatch(/^[0-9a-z]{8}\n$/);
  expect(
    JSON.parse(
      readFileSync(join(home, `.mesa/default/sessions/${plain.stdout.trim()}.json`), 'utf8'),
    ).agentSessionId,
  ).toBe('00000000-0000-4000-8000-000000000002');
  expect(plain.exec).toBeUndefined();

  const attached = await mesa('open', 'lantern-cove', '--attach');
  const id = attached.stdout.trim();
  expect(attached.exec).toEqual([
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
    expect.stringMatching(new RegExp(`^=_view-[0-9a-z]{8}:=claude-${id}$`)),
  ]);
  expect(await mesa('open', 'tide')).toMatchObject({ code: 3 });
  expect(await mesa('open', 'lantern-cove', '--agent', 'codex')).toMatchObject({
    code: 7,
    stderr: 'codex support is planned in #43\n',
  });
});

test('attach: here it hands back the attach argv, --app opens terminal.app, gone is exit 3', async () => {
  await mesa('init', '--vault', 'vault');
  const dir = join(home, '.mesa/default/sessions');
  writeFileSync(
    join(dir, 'aaaaaaaa.json'),
    JSON.stringify({ id: 'aaaaaaaa', ...newSession(), events: [] }),
  );
  const here = await mesa('attach', 'aaaaaaaa', '--json');
  expect(here.json.data).toEqual({ opened: true, target: 'lantern-cove:claude-aaaaaa', app: null });
  expect(here.exec?.slice(-2)).toEqual([
    '-t',
    expect.stringMatching(/^=_view-[0-9a-z]{8}:=claude-aaaaaa$/),
  ]);

  // --print: the argv the app's terminal runs, no terminal needed, nothing attached.
  tty = false;
  const printed = await mesa('attach', 'aaaaaaaa', '--print', '--json');
  // Every terminal gets a fresh view session: the same command, its own view id.
  expect(printed.json.data.target).toBe('lantern-cove:claude-aaaaaa');
  expect(printed.json.data.argv.slice(0, 8)).toEqual(here.exec?.slice(0, 8));
  expect(printed.json.data.argv[9]).not.toBe(here.exec?.[9]);
  expect(printed.exec).toBeUndefined();
  tty = true;
  // resize: the window takes the view's size, then the size goes back to tmux's own policy.
  const { run: sized, calls } = scriptedRunner({ tmux: '' });
  run = sized;
  expect((await mesa('resize', 'aaaaaaaa', '120', '40', '--json')).json.data).toEqual({
    session: 'aaaaaaaa',
    target: 'lantern-cove:claude-aaaaaa',
    cols: 120,
    rows: 40,
  });
  expect(calls.at(-1)?.args.slice(4)).toEqual([
    'resize-window',
    '-t',
    '=lantern-cove:=claude-aaaaaa',
    '-x',
    '120',
    '-y',
    '40',
    ';',
    'set-option',
    '-w',
    '-t',
    '=lantern-cove:=claude-aaaaaa',
    '-u',
    'window-size',
  ]);
  expect(await mesa('resize', 'aaaaaaaa', '0', '40')).toMatchObject({ code: 2 });
  expect(await mesa('resize', 'ext-4242', '120', '40')).toMatchObject({ code: 3 });
  run = scriptedRunner({ tmux: 'tmux 3.7c', claude: '2.1.282 (Claude Code)' }).run;

  await mesa('config', 'set', 'terminal.app', 'WezTerm');
  const app = await mesa('attach', 'aaaaaaaa', '--app');
  expect(app).toMatchObject({ stdout: 'attaching to lantern-cove:claude-aaaaaa in WezTerm\n' });
  expect(app.exec).toBeUndefined();
  expect((await mesa('config', 'set', 'terminal.app', 'Hyper')).code).toBe(4);

  // Without a terminal only --app can attach; open --attach refuses before opening anything.
  tty = false;
  expect(await mesa('attach', 'aaaaaaaa', '--json')).toMatchObject({ code: 2 });
  expect((await mesa('attach', 'aaaaaaaa', '--app')).code).toBe(0);
  expect(await mesa('open', 'lantern-cove', '--attach')).toMatchObject({
    code: 2,
    stderr: 'not a terminal: run this in one, or use mesa attach --app\n',
  });

  tty = true;
  run = scriptedRunner({}, { failing: ['tmux'] }).run;
  expect(await mesa('attach', 'aaaaaaaa')).toMatchObject({
    code: 3,
    stderr: 'session ended; use mesa resume\n',
  });
});

test('stop and resume print the updated and the new record', async () => {
  const world = fakeTmux({
    onKeys: (w, text) => {
      if (text === '/exit') w.dead = true;
    },
  });
  run = scriptedRunner({ tmux: world.answer, claude: '2.1.282 (Claude Code)' }).run;
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  mkdirSync(join(home, 'src/lantern-cove'), { recursive: true });
  await mesa('register', '--create', join(home, 'src/lantern-cove'));
  const id = (await mesa('open', 'lantern-cove')).stdout.trim();

  const stopped = await mesa('stop', id, '--json');
  expect(stopped.json.data).toMatchObject({
    id,
    outcome: 'exited',
    endedAt: '2026-09-24T12:00:00.000Z',
    lastState: { state: 'done' },
    receipt: { id: expect.stringMatching(/^01TEST/) },
  });
  expect((await mesa('stop', id)).stdout).toBe(`session ${id} had already ended\n`);

  const resumed = await mesa('resume', id, '--json');
  expect(resumed.json.data).toMatchObject({
    resumedFrom: id,
    agentSessionId: stopped.json.data.agentSessionId,
  });
  expect((await mesa('sessions', '--all')).stdout.split('\n').filter(Boolean)).toHaveLength(2);
  expect((await mesa('stop', 'zzzzzzzz')).code).toBe(3);
});

test('send prints {sent, session, chars}; a gone session is exit 3', async () => {
  const world = fakeTmux();
  run = scriptedRunner({ tmux: world.answer, claude: '2.1.282 (Claude Code)' }).run;
  await mesa('init', '--vault', 'vault');
  mkdirSync(join(home, 'src/lantern-cove'), { recursive: true });
  await mesa('register', '--create', join(home, 'src/lantern-cove'));
  const id = (await mesa('open', 'lantern-cove')).stdout.split('\n')[0] ?? '';
  const { json } = await mesa('send', id, 'say hello', '--json');
  expect(json.data).toMatchObject({ sent: true, session: id, chars: 9 });
  expect(world.windows[0]?.typed).toEqual(['say hello']);
  expect((await mesa('send', id, 'again')).stdout.split('\n')[0]).toBe(
    `sent 5 characters to ${id}`,
  );
  world.windows.splice(0);
  expect(await mesa('send', id, 'hi')).toMatchObject({ code: 3 });
});

test('hooks install, status, uninstall, and a hook appending its payload', async () => {
  await mesa('init', '--vault', 'vault');
  expect((await mesa('hooks', 'status', '--json')).json.data.installed).toBe(false);
  const installed = await mesa('hooks', 'install', '--json');
  expect(installed.json.data).toMatchObject({ installed: true, changed: true });
  expect((await mesa('hooks', 'install')).stdout).toBe('hooks already installed\n');

  // A hook from a Mesa session appends to its log; from anything else it records nothing.
  stdin = JSON.stringify({ session_id: 'uuid-1', hook_event_name: 'Stop' });
  expect((await mesa('hook', 'claude', '--json')).json.data).toEqual({
    recorded: false,
    event: null,
  });
  env = { MESA_SESSION_ID: 'aaaaaaaa' };
  expect((await mesa('hook', 'claude', '--json')).json.data).toEqual({
    recorded: true,
    event: 'Stop',
  });
  const log = readFileSync(join(home, '.mesa/default/sessions/events/aaaaaaaa.jsonl'), 'utf8');
  expect(JSON.parse(log)).toMatchObject({
    agent: 'claude',
    event: 'Stop',
    agentSessionId: 'uuid-1',
  });
  expect(await mesa('hook', 'codex')).toMatchObject({ code: 7 });

  env = {};
  expect((await mesa('hooks', 'uninstall', '--json')).json.data).toMatchObject({
    installed: false,
    changed: true,
  });
  expect(readFileSync(join(home, '.claude/settings.json'), 'utf8')).toBe('{}\n');
});

test('windows lists the profile tmux server; none is an empty list, no tmux exit 6', async () => {
  const scripted = scriptedRunner({
    tmux: 'lantern\t0\tclaude-aaaaaa\t4242\t2.1.282\t/src/lantern\t1790359178\t1\n',
  });
  run = scripted.run;
  const { json } = await mesa('windows', '--json');
  expect(json.data).toEqual([
    expect.objectContaining({ project: 'lantern', window: 'claude-aaaaaa', dead: true }),
  ]);
  expect((await mesa('windows', 'lantern')).stdout).toBe(
    'lantern:claude-aaaaaa  (exited)  /src/lantern\n',
  );
  expect(scripted.calls[1]?.args.slice(0, 6)).toEqual([
    '-L',
    'mesa-default',
    '-f',
    '/dev/null',
    'list-windows',
    '-t',
  ]);
  run = scriptedRunner({ tmux: '' }).run;
  expect((await mesa('windows')).stdout).toBe('no Mesa tmux windows\n');
  run = scriptedRunner({}, { missing: ['tmux'] }).run;
  expect(await mesa('windows')).toMatchObject({ code: 6 });
});

test('profile and version', async () => {
  expect((await mesa('profile', '--json')).json).toEqual({
    ok: true,
    data: { profile: 'default', dir: `${home}/.mesa/default` },
  });
  expect((await mesa('--version')).stdout).toBe(`${VERSION}\n`);
});

/** An example's words after `mesa`, split as a shell splits them, up to a redirect or a pipe. */
const wordsOf = (example: string) => {
  const words = [
    ...example
      .slice(example.indexOf('mesa ') + 'mesa '.length)
      .matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g),
  ].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
  const end = words.findIndex((w) => w === '<' || w === '|');
  return end === -1 ? words : words.slice(0, end);
};

test('every example parses as its own command: its arguments, flags, and required flags', async () => {
  // The real parser, with each run replaced by one that names its command.
  const named = COMMANDS.map((c) => ({ ...c, run: () => ({ data: c.name, text: c.name }) }));
  for (const command of COMMANDS) {
    expect(command.example, command.name).toContain('mesa ');
    const out = await runCli(wordsOf(command.example), {
      commands: named,
      env: {},
      tty: false,
      stdin: async () => '',
      mesa: testDeps(home, { run }),
    });
    expect(out, command.example).toMatchObject({ code: 0, stdout: `${command.name}\n` });
  }
});

test('mesa help --agent lists every registered command; --json has one entry each', async () => {
  const markdown = (await mesa('help', '--agent')).stdout;
  const { data } = (await mesa('help', '--agent', '--json')).json;
  expect(data.map((c: { name: string }) => c.name)).toEqual(COMMANDS.map((c) => c.name));
  // The whole heading, so `mesa config set` cannot stand in for a missing `mesa config`.
  for (const c of data) expect(markdown).toContain(`\n### \`${c.usage}\`\n`);
  expect(data.find((c: { name: string }) => c.name === 'send')).toEqual({
    name: 'send',
    usage: 'mesa send <session> <prompt> [--force]',
    description: "Type a prompt into a session's agent, then Enter",
    args: [
      { name: 'session', required: true },
      { name: 'prompt', required: true },
    ],
    flags: [
      {
        name: 'force',
        type: 'boolean',
        required: false,
        description: 'Send even when the pane runs a shell, not the agent',
      },
    ],
    example: 'mesa send a1b2c3d4 "run the tests, then summarise the failures"',
  });
});

test('mesa help without --agent prints the command list', async () => {
  const { stdout } = await mesa('help');
  expect(stdout).toBe((await mesa('--help')).stdout);
});

test('open --goal and --goal-file start with a goal; mesa goal prints it', async () => {
  const world = fakeTmux();
  run = scriptedRunner({ tmux: world.answer, claude: '2.1.282 (Claude Code)' }).run;
  await mesa('init', '--vault', 'vault');
  mkdirSync(join(home, 'src/lantern-cove'), { recursive: true });
  await mesa('register', '--create', join(home, 'src/lantern-cove'));
  const opened = await mesa('open', 'lantern-cove', '--goal', 'Print the word ready and stop');
  const id = opened.stdout.split('\n')[0] ?? '';
  expect(world.windows.at(-1)?.launch).toBe(
    "claude --session-id 00000000-0000-4000-8000-000000000001 'Print the word ready and stop'",
  );
  expect((await mesa('goal', id, '--json')).json).toEqual({
    ok: true,
    data: { id, goal: 'Print the word ready and stop' },
  });
  expect((await mesa('goal', id)).stdout).toBe('Print the word ready and stop\n');

  // A relative --goal-file is read from where mesa runs.
  writeFileSync(join(home, 'goal.md'), 'From a file\n');
  const fromFile = await mesa('open', 'lantern-cove', '--goal-file', 'goal.md', '--json');
  expect(fromFile.json.data.goal).toBe('From a file\n');
  expect(world.windows.at(-1)?.launch).toBe(
    "claude --session-id 00000000-0000-4000-8000-000000000002 'From a file\n'",
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
  const world = fakeTmux();
  run = scriptedRunner({ tmux: world.answer, claude: '2.1.282 (Claude Code)' }).run;
  await mesa('init', '--vault', 'vault');
  mkdirSync(join(home, 'src/lantern-cove'), { recursive: true });
  await mesa('register', '--create', join(home, 'src/lantern-cove'));
  const a = (await mesa('open', 'lantern-cove', '--json')).json.data.id;
  env = { MESA_SESSION_ID: a };
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
