import { mkdirSync, writeFileSync } from 'node:fs';
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

/** A Mesa claude session whose transcript holds $0.27 of claude-opus-5-5 output. */
async function costedSession() {
  cli.withTmux();
  const dir = await cli.withProject();
  const id = (await cli.mesa('open', 'lantern-cove')).stdout.split('\n')[0] ?? '';
  const nativeId = (await cli.mesa('show', id, '--json')).json.data.agentSessionId;
  plantTranscript(
    cli.home,
    nativeId,
    dir,
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-09-24T12:00:00.000Z',
      message: {
        id: 'msg_lantern',
        model: 'claude-opus-5-5',
        usage: {
          input_tokens: 0,
          output_tokens: 13_500,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    }),
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
  return { id, dir, shells };
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
  const { id, dir } = await costedSession();
  writeSettings(join(cli.home, '.claude', 'settings.json'), {
    type: 'command',
    command: MODEL_LINE,
  });
  cli.stdin = payload(dir);

  // A session with no transcript yet has an unknown cost, never $0.00.
  const fresh = (await cli.mesa('open', 'lantern-cove')).stdout.split('\n')[0] ?? '';
  cli.env = { ...cli.env, MESA_SESSION_ID: fresh };
  expect(await cli.mesa('statusline')).toMatchObject({ code: 0, stdout: 'Opus on main\n' });
  cli.env = { ...cli.env, MESA_SESSION_ID: id };

  // A ledger that does not read.
  writeFileSync(cli.paths.usage, '{not json');
  expect(await cli.mesa('statusline')).toMatchObject({ code: 0, stdout: 'Opus on main\n' });
  expect((await cli.mesa('statusline', '--json')).json.data).toMatchObject({
    session: id,
    estimatedCostUsd: null,
  });

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
