import { MesaError } from '../lib/result.js';
import type { TerminalApp } from '../profile/config.js';
import type { Profile } from '../profile/profile.js';
import { readProjectFile } from '../projects/project-file.js';
import { findProject } from '../projects/projects.js';
import type { SessionStore } from './store.js';
import { openInApp, type TerminalAppDeps } from './terminal-app.js';
import type { TmuxBackend } from './tmux/backend.js';
import { windowOf } from './window-name.js';

// A project view (CONTEXT.md): a project's sessions side by side in one terminal.

/** What `mesa view --json` prints: the sessions shown, their layout, and the app (null: here). */
export type Viewed = {
  opened: true;
  project: string;
  sessions: string[];
  layout: string;
  app: TerminalApp | null;
};

// ponytail: tmux's own even split, whatever the number of panes.
/** The layout of a view whose project's mesa.yaml names none. */
const DEFAULT_LAYOUT = 'tiled';

/**
 * Shows a project's sessions side by side: every session of it with a window, oldest first, as
 * a pane of one view window, laid out by its mesa.yaml `tmux.layout` (tiled when unset). Here it
 * returns the argv that attaches this terminal; with `app`, it opens the app on it, and removes
 * the view again when the app cannot open. not_found when no session of it has a window.
 */
export async function viewProject(
  deps: TerminalAppDeps & {
    profile: Profile;
    store: SessionStore;
    tmux: Pick<TmuxBackend, 'listWindows' | 'openView' | 'viewAttachArgv' | 'closeView'>;
    /** A fresh id for each view session: the view's, and each pane's own. */
    viewId: () => string;
  },
  project: string,
  app?: TerminalApp,
): Promise<{ viewed: Viewed; exec?: string[] }> {
  const entry = findProject(deps.profile, project);
  const layout = readProjectFile(entry.path).tmux?.layout ?? DEFAULT_LAYOUT;
  const windows = new Set((await deps.tmux.listWindows(project)).map((w) => w.window));
  const shown = deps.store
    .list()
    .filter((r) => r.project === project && !r.endedAt && windows.has(r.tmux.window));
  if (!shown.length) {
    throw new MesaError(
      'not_found',
      `no session of ${project} has a window to view; mesa open ${project}`,
    );
  }
  const view = await deps.tmux.openView(shown.map(windowOf), layout, project, deps.viewId);
  const argv = deps.tmux.viewAttachArgv(view);
  const viewed: Viewed = {
    opened: true,
    project,
    sessions: shown.map((r) => r.id),
    layout,
    app: app ?? null,
  };
  // Here: the caller replaces its process with the attach.
  if (!app) return { viewed, exec: argv };
  try {
    await openInApp(deps, app, `view-${project}`, argv);
  } catch (error) {
    // No terminal will ever attach it, so nothing would remove it.
    await deps.tmux.closeView(view);
    throw error;
  }
  return { viewed };
}
