import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Env, type Runner, shellWord } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { TerminalApp } from '../profile/config.js';

const LAUNCH_TIMEOUT_MS = 10_000;

/** What opening an argv in the user's terminal app takes. */
export type TerminalAppDeps = {
  run: Runner;
  /** Where the one-line scripts that terminal apps open are written. */
  scripts: string;
  /** For PATH: an app launched by launchd may not have Homebrew's tmux on its own. */
  env: Env;
};

/**
 * Runs `argv` in the user's terminal app (config `terminal.app`): every app, Terminal too, opens
 * a one-line script, `<scripts>/<name>.command`, with `open -a <app>`.
 */
export async function openInApp(
  deps: TerminalAppDeps,
  app: TerminalApp,
  name: string,
  argv: readonly string[],
) {
  mkdirSync(deps.scripts, { recursive: true, mode: 0o700 });
  // ponytail: one small script per name, rewritten on each open and never removed; delete them
  // with the session if the folder ever grows enough to matter.
  const file = join(deps.scripts, `${name}.command`);
  const path = deps.env.PATH ? `export PATH=${shellWord(deps.env.PATH)}\n` : '';
  writeFileSync(file, `#!/bin/sh\n${path}exec ${argv.map(shellWord).join(' ')}\n`);
  chmodSync(file, 0o700);
  const res = await deps.run('open', ['-a', app, file], LAUNCH_TIMEOUT_MS);
  if (!res.ok) throw new MesaError('internal', `could not open ${app}: ${res.detail}`);
}
