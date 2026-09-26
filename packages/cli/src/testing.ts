import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { MesaDeps, Runner } from '@mesa/core';
import {
  CLAUDE_VERSION,
  fakeTmux,
  scriptedRunner,
  sequentialIds,
  sequentialUuids,
  tempDir,
  testDeps,
} from '@mesa/core/testing';
import { type CliDeps, runCli } from './cli.js';
import { COMMANDS } from './commands/index.js';

/** CliDeps over a temp home: every real command, no terminal, empty stdin, unless told otherwise. */
export const cliDeps = (
  home: string,
  { mesa = {}, ...rest }: Partial<Omit<CliDeps, 'mesa'>> & { mesa?: Partial<MesaDeps> } = {},
): CliDeps => ({
  commands: COMMANDS,
  env: {},
  tty: false,
  stdin: async () => '',
  mesa: testDeps(home, mesa),
  ...rest,
});

/**
 * Every real command through runCli against a temp home, so nothing touches the real HOME. `reset`
 * before each test gives a fresh home, runner, ids, terminal, stdin, and environment; a test sets
 * the fields it changes before the invocations that should see them.
 */
export function cliHarness() {
  const h = {
    home: '',
    run: scriptedRunner().run as Runner,
    newId: sequentialIds(),
    newUuid: sequentialUuids(),
    /** Whether the next invocations run in a terminal. */
    tty: true,
    /** What the next invocations read on stdin. */
    stdin: '',
    /** The environment of the next invocations (MESA_SESSION_ID for a hook). */
    env: {} as Record<string, string>,
    reset: () => {
      h.home = tempDir();
      // One id source per test, shared by its invocations.
      h.newId = sequentialIds();
      h.newUuid = sequentialUuids();
      h.tty = true;
      h.stdin = '';
      h.env = {};
      h.run = scriptedRunner({ tmux: 'tmux 3.7c', claude: CLAUDE_VERSION }).run;
    },
    mesa: async (...argv: string[]) => {
      // An empty home is the repo's folder: a file that forgot beforeEach(cli.reset) would write there.
      if (!h.home) throw new Error('cliHarness: run beforeEach(cli.reset) first');
      const out = await runCli(
        argv,
        cliDeps(h.home, {
          tty: h.tty,
          stdin: async () => h.stdin,
          mesa: { run: h.run, argv, newId: h.newId, newUuid: h.newUuid, env: h.env },
        }),
      );
      return { ...out, json: out.stdout.startsWith('{') ? JSON.parse(out.stdout) : undefined };
    },
    /** A tmux server in memory, and claude, for the next invocations; the server, to read or shape. */
    withTmux: (opts?: Parameters<typeof fakeTmux>[0]) => {
      const world = fakeTmux(opts);
      h.run = scriptedRunner({ tmux: world.answer, claude: CLAUDE_VERSION }).run;
      return world;
    },
    /** An initialised profile with `name` registered, and its vault laid out unless told; its folder. */
    withProject: async ({ name = 'lantern-cove', layOut = true } = {}) => {
      await h.mesa('init', '--vault', 'vault');
      if (layOut) await h.mesa('vault', 'init');
      const dir = join(h.home, 'src', name);
      mkdirSync(dir, { recursive: true });
      await h.mesa('register', '--create', dir);
      return dir;
    },
  };
  return h;
}
