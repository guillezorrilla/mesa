import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeFileAtomic } from '../lib/atomic-file.js';
import { type Env, type Runner, shellWord } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { TerminalApp } from '../profile/config.js';

const LAUNCH_TIMEOUT_MS = 10_000;
const WEZTERM_CLI = '/Applications/WezTerm.app/Contents/MacOS/wezterm';

/** What opening an argv in the user's terminal app takes. */
export type TerminalAppDeps = {
  run: Runner;
  /** Where the one-line scripts that terminal apps open are written. */
  scripts: string;
  /** For PATH: an app launched by launchd may not have Homebrew's tmux on its own. */
  env: Env;
  wezTermNewTab?: boolean;
};

/** WezTerm's own CLI can target a real window; no window means the normal app launch path. */
async function openWezTermTab(deps: TerminalAppDeps, script: string): Promise<boolean> {
  const listed = await deps.run(
    WEZTERM_CLI,
    ['cli', 'list', '--format', 'json'],
    LAUNCH_TIMEOUT_MS,
  );
  if (!listed.ok) return false;
  let panes: unknown;
  try {
    panes = JSON.parse(listed.stdout);
  } catch {
    throw new MesaError('internal', 'could not read WezTerm windows');
  }
  if (!Array.isArray(panes)) throw new MesaError('internal', 'could not read WezTerm windows');
  const inWindow = (item: unknown): item is { window_id: number; is_active?: boolean } =>
    Boolean(
      item &&
        typeof item === 'object' &&
        Number.isInteger((item as { window_id?: unknown }).window_id),
    );
  const pane = panes.find((item) => inWindow(item) && item.is_active) ?? panes.find(inWindow);
  if (!pane) return false;
  const opened = await deps.run(
    WEZTERM_CLI,
    ['cli', 'spawn', '--window-id', String(pane.window_id), '--', script],
    LAUNCH_TIMEOUT_MS,
  );
  if (!opened.ok) throw new MesaError('internal', `could not open WezTerm tab: ${opened.detail}`);
  return true;
}

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
  writeFileAtomic(file, `#!/bin/sh\n${path}exec ${argv.map(shellWord).join(' ')}\n`, 0o700);
  if (app === 'WezTerm' && deps.wezTermNewTab && (await openWezTermTab(deps, file))) return;
  const res = await deps.run('open', ['-a', app, file], LAUNCH_TIMEOUT_MS);
  if (!res.ok) throw new MesaError('internal', `could not open ${app}: ${res.detail}`);
}
