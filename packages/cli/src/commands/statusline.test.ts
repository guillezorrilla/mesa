import { appendFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execRunner, type Runner } from '@mesa/core';
import { plantTranscript } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

/** Claude's stdin JSON, as it hands it to a status line command. */
const payload = (projectDir: string) =>
  JSON.stringify({
    session_id: 'native-lantern',
    model: { id: 'claude-opus-5-5', display_name: 'Opus' },
    workspace: { current_dir: projectDir, project_dir: projectDir },
  });

/** A user status line that prints the model's display name from its stdin, so stdin is shared. */
const MODEL_LINE = String.raw`sed -E 's/.*"display_name":"([^"]+)".*/\1 on main/'`;

const writeSettings = (path: string, statusLine: unknown) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ statusLine }, null, 2)}\n`);
};

/** One transcript turn: the prompt, then a claude-opus-5-5 reply of `output` tokens ($20/M). */
const turn = (n: number, output: number, at = '2026-09-24T12:00:00.000Z') =>
  [
    JSON.stringify({
      type: 'user',
      timestamp: at,
      message: { role: 'user', content: `Chart shoal ${n} of the lantern cove survey` },
    }),
    JSON.stringify({
      type: 'assistant',
      timestamp: at,
      message: {
        id: `msg_lantern_${n}`,
        model: 'claude-opus-5-5',
        content: [
          { type: 'text', text: `Shoal ${n} charted: ${'depth soundings logged. '.repeat(20)}` },
        ],
        usage: {
          input_tokens: 0,
          output_tokens: output,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    }),
  ].join('\n');

/** A Mesa claude session whose transcript holds `transcript`: $0.27 of output by default. */
async function costedSession(transcript = `${turn(0, 13_500)}\n`) {
  cli.withTmux();
  const dir = await cli.withProject();
  const id = (await cli.mesa('open', 'lantern-cove')).stdout.split('\n')[0] ?? '';
  const nativeId = (await cli.mesa('show', id, '--json')).json.data.agentSessionId;
  plantTranscript(cli.home, nativeId, dir, transcript);
  const file = join(
    cli.home,
    '.claude',
    'projects',
    dir.replaceAll(/[^A-Za-z0-9]/g, '-'),
    `${nativeId}.jsonl`,
  );
  // The user's status line runs in a real shell; tmux and claude stay scripted.
  const scripted = cli.run;
  /** Each command line the user's status line ran. */
  const shells: string[] = [];
  const run: Runner = (file, args, timeout, options) => {
    if (file !== '/bin/sh') return scripted(file, args, timeout, options);
    shells.push(args[1] ?? '');
    return execRunner(file, args, timeout, options);
  };
  cli.run = run;
  cli.env = { MESA_SESSION_ID: id, MESA_PROFILE: 'default', PATH: '/usr/bin:/bin' };
  return { id, dir, shells, file };
}

test("statusline runs the user's own status line with Claude's stdin and appends the session's cost", async () => {
  const { id, dir } = await costedSession();
  writeSettings(join(cli.home, '.claude', 'settings.json'), {
    type: 'command',
    command: MODEL_LINE,
    padding: 0,
  });
  cli.stdin = payload(dir);
  const out = await cli.mesa('statusline');
  expect(out).toMatchObject({ code: 0, stdout: 'Opus on main · $0.27 est.\n', stderr: '' });

  const json = await cli.mesa('statusline', '--json');
  expect(json.json.data).toEqual({
    line: 'Opus on main · $0.27 est.',
    user: 'Opus on main',
    session: id,
    estimatedCostUsd: expect.closeTo(0.27, 10),
  });

  // The usage is cached now: the line stays well inside Claude's 300 ms debounce.
  const started = performance.now();
  expect((await cli.mesa('statusline')).stdout).toBe('Opus on main · $0.27 est.\n');
  expect(performance.now() - started).toBeLessThan(300);
});

test("the project's local settings win over the user's, and with none the cost shows alone", async () => {
  const { dir } = await costedSession();
  cli.stdin = payload(dir);
  expect((await cli.mesa('statusline')).stdout).toBe('$0.27 est.\n');

  writeSettings(join(cli.home, '.claude', 'settings.json'), {
    type: 'command',
    command: 'echo user',
  });
  writeSettings(join(dir, '.claude', 'settings.local.json'), {
    type: 'command',
    command: 'echo local',
  });
  expect((await cli.mesa('statusline')).stdout).toBe('local · $0.27 est.\n');
});

test("statusline never fails the line: on Mesa's error the user's line shows alone", async () => {
  const { id, dir, file } = await costedSession();
  writeSettings(join(cli.home, '.claude', 'settings.json'), {
    type: 'command',
    command: MODEL_LINE,
  });
  cli.stdin = payload(dir);

  // A tally Mesa cannot write: its folder is a file.
  writeFileSync(cli.paths.costs, 'not a folder');
  expect(await cli.mesa('statusline')).toMatchObject({ code: 0, stdout: 'Opus on main\n' });
  expect((await cli.mesa('statusline', '--json')).json.data).toMatchObject({
    session: id,
    estimatedCostUsd: null,
  });
  rmSync(cli.paths.costs);
  expect((await cli.mesa('statusline')).stdout).toBe('Opus on main · $0.27 est.\n');

  // A session with no transcript yet has an unknown cost, never $0.00.
  const fresh = (await cli.mesa('open', 'lantern-cove')).stdout.split('\n')[0] ?? '';
  cli.env = { ...cli.env, MESA_SESSION_ID: fresh };
  expect(await cli.mesa('statusline')).toMatchObject({ code: 0, stdout: 'Opus on main\n' });
  cli.env = { ...cli.env, MESA_SESSION_ID: id };

  // A reply from a model with no list price makes the session's cost unknown.
  const unpriced = turn(1, 10).replace('claude-opus-5-5', 'claude-lantern-preview');
  appendFileSync(file, `${unpriced}\n`);
  expect(await cli.mesa('statusline')).toMatchObject({ code: 0, stdout: 'Opus on main\n' });

  // Outside a Mesa session, there is no session's cost to add.
  cli.env = { PATH: '/usr/bin:/bin' };
  expect(await cli.mesa('statusline')).toMatchObject({ code: 0, stdout: 'Opus on main\n' });

  // Stdin that is not JSON still reaches the user's command as it came.
  cli.stdin = 'not json';
  expect(await cli.mesa('statusline')).toMatchObject({ code: 0, stdout: 'not json\n' });
});

test("a failing user status line leaves the cost, and Mesa's own command is never run as the user's", async () => {
  const { dir, shells } = await costedSession();
  cli.stdin = payload(dir);
  const settings = join(cli.home, '.claude', 'settings.json');
  writeSettings(settings, { type: 'command', command: 'exit 3' });
  expect(await cli.mesa('statusline')).toMatchObject({ code: 0, stdout: '$0.27 est.\n' });

  // testDeps' self: the line Claude would run if the user had copied Mesa's into their settings.
  writeSettings(settings, { type: 'command', command: "'/usr/local/bin/mesa' statusline" });
  expect((await cli.mesa('statusline', '--json')).json.data.user).toBeNull();
  expect(shells).toEqual(['exit 3']);
});

test('a long session costs only its new lines: the budget holds and the usage ledger is untouched', async () => {
  const turns = Array.from({ length: 5_000 }, (_, n) => turn(n, 1_000)).join('\n');
  const { id, file } = await costedSession(`${turns}\n`);
  // The ledger as `mesa usage` keeps it, which the status line never rewrites.
  const usage = await cli.mesa('usage', '--session', id, '--json');
  expect(usage.json.data.rows).toHaveLength(5_000);
  const ledger = {
    text: readFileSync(cli.paths.usage, 'utf8'),
    at: statSync(cli.paths.usage).mtimeMs,
  };
  cli.stdin = payload('/nowhere');
  // The first look reads the whole transcript once; it counts as the ledger does ($0.02 a turn).
  expect((await cli.mesa('statusline')).stdout).toBe('$100.00 est.\n');

  appendFileSync(file, `${turn(5_000, 1_000)}\n`);
  const started = performance.now();
  expect((await cli.mesa('statusline')).stdout).toBe('$100.02 est.\n');
  expect(performance.now() - started).toBeLessThan(300);
  // A repeated message id is an update to one charge, as in the ledger.
  appendFileSync(file, `${turn(5_000, 2_000)}\n`);
  expect((await cli.mesa('statusline')).stdout).toBe('$100.04 est.\n');
  // A reply from before the session started is not its cost, as in the ledger.
  appendFileSync(file, `${turn(5_001, 1_000, '2026-01-01T00:00:00.000Z')}\n`);
  expect((await cli.mesa('statusline')).stdout).toBe('$100.04 est.\n');
  // A transcript rewritten in place, at the same size, is counted again: turn 0 now costs $0.18.
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace('"output_tokens":1000', '"output_tokens":9000'),
  );
  expect((await cli.mesa('statusline')).stdout).toBe('$100.20 est.\n');
  // And one rewritten larger, which an append alone would not explain: turn 1 now costs $0.20.
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace('"output_tokens":1000', '"output_tokens":10000'),
  );
  expect((await cli.mesa('statusline')).stdout).toBe('$100.38 est.\n');
  expect(readFileSync(cli.paths.usage, 'utf8')).toBe(ledger.text);
  expect(statSync(cli.paths.usage).mtimeMs).toBe(ledger.at);
});

test("the user's command runs under a marker, so a Mesa status line of any mesa under it prints nothing", async () => {
  const { dir, shells } = await costedSession();
  cli.stdin = payload(dir);
  writeSettings(join(cli.home, '.claude', 'settings.json'), {
    type: 'command',
    command: 'echo "nested=$MESA_STATUS_LINE"',
  });
  expect((await cli.mesa('statusline')).stdout).toBe('nested=1 · $0.27 est.\n');

  // That nested mesa, from whatever path: no line, and no user command run again.
  cli.env = { ...cli.env, MESA_STATUS_LINE: '1' };
  expect(await cli.mesa('statusline')).toMatchObject({ code: 0, stdout: '\n' });
  expect(shells).toHaveLength(1);
});

test("the user's settings are read under CLAUDE_CONFIG_DIR when Claude's environment sets it", async () => {
  const { dir } = await costedSession();
  cli.stdin = payload(dir);
  writeSettings(join(cli.home, '.claude', 'settings.json'), {
    type: 'command',
    command: 'echo home',
  });
  const config = join(cli.home, 'claude-config');
  writeSettings(join(config, 'settings.json'), { type: 'command', command: 'echo config dir' });
  expect((await cli.mesa('statusline')).stdout).toBe('home · $0.27 est.\n');
  cli.env = { ...cli.env, CLAUDE_CONFIG_DIR: config };
  expect((await cli.mesa('statusline')).stdout).toBe('config dir · $0.27 est.\n');
});

test('after /clear moves the session to a conversation Mesa does not know, its cost is unknown', async () => {
  const { dir } = await costedSession();
  const nativeId = (await cli.mesa('show', cli.env.MESA_SESSION_ID ?? '', '--json')).json.data
    .agentSessionId;
  cli.stdin = payload(dir);
  expect((await cli.mesa('statusline')).stdout).toBe('$0.27 est.\n');
  cli.stdin = JSON.stringify({ session_id: nativeId, hook_event_name: 'SessionEnd' });
  await cli.mesa('hook', 'claude');
  cli.stdin = JSON.stringify({
    session_id: '00000000-0000-4000-8000-00000000c1ea',
    hook_event_name: 'SessionStart',
    source: 'clear',
  });
  await cli.mesa('hook', 'claude');
  cli.stdin = payload(dir);
  expect(await cli.mesa('statusline')).toMatchObject({ code: 0, stdout: '\n' });
});
