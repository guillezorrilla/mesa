import type { TerminalApp } from '../profile/config.js';
import { sessionEnded } from './record.js';
import type { SessionStore } from './store.js';
import { openInApp, type TerminalAppDeps } from './terminal-app.js';
import type { TmuxBackend } from './tmux/backend.js';
import { targetLabel } from './tmux/format.js';
import { windowOf } from './window-name.js';

// The board's "open its terminal" action in v1 (ADR-0003 amendment): the session's tmux window in
// this terminal, or in the user's terminal app.

/** What `mesa attach --json` prints: the tmux target, and the app it opened in (null: here). */
export type Attached = { opened: true; target: string; app: TerminalApp | null };

export async function attachSession(
  deps: TerminalAppDeps & {
    store: SessionStore;
    tmux: Pick<TmuxBackend, 'windowExists' | 'attachArgv'>;
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

  await openInApp(deps, app, id, argv);
  return { attached };
}
