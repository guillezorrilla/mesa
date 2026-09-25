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
beforeEach(() => {
  home = tempDir();
  newId = sequentialIds(); // one id source per test, shared by its invocations
  newUuid = sequentialUuids();
  tty = true;
  run = scriptedRunner({ tmux: 'tmux 3.7c', claude: '2.1.282 (Claude Code)' }).run;
});
const mesa = async (...argv: string[]) => {
  const out = await runCli(argv, {
    commands: COMMANDS,
    env: {},
    tty,
    mesa: testDeps(home, { run, argv, newId, newUuid }),
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
    stderr: '--vault is required. Usage: mesa init --vault <value> [flags]\n',
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
  // tmux still has lantern-cove's window; harbor's is gone.
  run = scriptedRunner({
    tmux: 'lantern-cove\t0\tclaude-aaaaaa\t4242\t2.1.282\t/src/lantern-cove\t1790359178\t0\n',
  }).run;

  const { json } = await mesa('sessions', '--json');
  expect(json.data.map((s: { id: string; alive: boolean }) => [s.id, s.alive])).toEqual([
    ['aaaaaaaa', true],
    ['cccccccc', false],
  ]);
  expect(json.data[1].lastState).toMatchObject({ state: 'done', source: 'tmux' });
  expect((await mesa('sessions', '--all')).stdout).toBe(
    [
      'bbbbbbbb  tide          claude  working  10m00s',
      'aaaaaaaa  lantern-cove  claude  working  1h00m',
      'cccccccc  harbor        claude  done     42s',
      '',
    ].join('\n'),
  );
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
    'attach-session',
    '-t',
    `=lantern-cove:=claude-${id}`,
    '-f',
    'ignore-size',
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
  expect(here.exec?.slice(-4)).toEqual(['-t', '=lantern-cove:=claude-aaaaaa', '-f', 'ignore-size']);

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
