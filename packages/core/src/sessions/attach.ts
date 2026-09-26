import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TerminalApp } from '../config.js';
import { type Env, type Runner, shellWord } from '../process.js';
import { MesaError } from '../result.js';
import { type SessionStore, sessionEnded, windowOf } from './store.js';
import { type TmuxBackend, targetLabel } from './tmux.js';

// The board's "open its terminal" action in v1 (ADR-0003 amendment): the session's tmux window in
// this terminal, or in the user's terminal app.

const LAUNCH_TIMEOUT_MS = 10_000;

/** What `mesa attach --json` prints: the tmux target, and the app it opened in (null: here). */
export type Attached = { opened: true; target: string; app: TerminalApp | null };

/** Sizes a session's window to a view (the app's terminal) now; tmux then follows its latest client. */
export async function resizeSession(
  deps: { store: SessionStore; tmux: Pick<TmuxBackend, 'resizeWindow'> },
  id: string,
  cols: number,
  rows: number,
) {
  const target = windowOf(deps.store.get(id));
  await deps.tmux.resizeWindow(target, cols, rows);
  return { session: id, target: targetLabel(target), cols, rows };
}

export async function attachSession(
  deps: {
    store: SessionStore;
    tmux: Pick<TmuxBackend, 'windowExists' | 'attachArgv'>;
    run: Runner;
    /** Where the one-line scripts that other terminal apps open are written. */
    scripts: string;
    /** For PATH: an app launched by launchd may not have Homebrew's tmux on its own. */
    env: Env;
    /** A fresh id for this terminal's view session. */
    viewId: () => string;
  },
  id: string,
  app?: TerminalApp,
): Promise<{ attached: Attached; exec?: string[] }> {
  const target = windowOf(deps.store.get(id));
  if (!(await deps.tmux.windowExists(target))) throw sessionEnded();
  const argv = deps.tmux.attachArgv(target, deps.viewId());
  const attached: Attached = {
    opened: true,
    target: targetLabel(target),
    app: app ?? null,
  };
  // Here: the caller replaces its process with the attach.
  if (!app) return { attached, exec: argv };

  // Every app, Terminal too, opens a one-line script: `open -a <app> <script>`.
  mkdirSync(deps.scripts, { recursive: true, mode: 0o700 });
  // ponytail: one small script per session, rewritten on each attach and never removed; delete
  // them with the session if the folder ever grows enough to matter.
  const file = join(deps.scripts, `${id}.command`);
  const path = deps.env.PATH ? `export PATH=${shellWord(deps.env.PATH)}\n` : '';
  writeFileSync(file, `#!/bin/sh\n${path}exec ${argv.map(shellWord).join(' ')}\n`);
  chmodSync(file, 0o700);
  const launch: [string, string[]] = ['open', ['-a', app, file]];
  const res = await deps.run(...launch, LAUNCH_TIMEOUT_MS);
  if (!res.ok) throw new MesaError('internal', `could not open ${app}: ${res.detail}`);
  return { attached };
}
