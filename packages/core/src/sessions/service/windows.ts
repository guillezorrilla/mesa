import type { MesaContext } from '../../context.js';
import { attachSession } from '../window/attach.js';
import { outputSince } from '../window/output-log.js';
import { resizeSession } from '../window/resize.js';
import { sessionScreen } from '../window/screen.js';
import { viewProject } from '../window/view.js';
import type { SessionDeps } from './deps.js';

/** Where a session is seen: its tmux window sized, attached, or laid out with its project's. */
export function windowActions(ctx: MesaContext, deps: SessionDeps) {
  const { open, store, tmux } = ctx;
  const { terminal, terminalApp, ensureBackgroundView } = deps;
  return {
    /** Sizes a session's window to a view now (the app's terminal, after each fit). */
    resize: (id: string, cols: number, rows: number) =>
      resizeSession({ store, tmux }, id, cols, rows),
    /** A session's window sized to the phone, as its terminal draws it (sessionScreen). */
    screen: (id: string, cols: number, rows: number) =>
      sessionScreen({ store, tmux, logs: ctx.paths.logs }, id, cols, rows),
    /** What a session's window printed since byte `from` of its output log (outputSince). */
    since: (id: string, from?: number) => outputSince(ctx.paths.logs, id, from),
    /**
     * Attaches to a live session: here (the argv to exec), or in config `terminal.app`;
     * `embedded` for the app's own terminal, which scrolls one line per wheel report.
     */
    attach: async (id: string, app = false, embedded = false) => {
      await ensureBackgroundView(id);
      return attachSession(
        {
          store,
          tmux,
          ...terminal,
          naturalSelection: open().config.terminal.naturalSelection,
          wezTermNewTab: open().config.terminal.wezTermNewTab,
        },
        id,
        app ? terminalApp() : undefined,
        embedded,
      );
    },
    /**
     * Shows a project's sessions side by side in one terminal, laid out by its mesa.yaml
     * `tmux.layout` (CONTEXT.md, Project view): here (the argv to exec), or in `terminal.app`.
     */
    view: (project: string, app = false) =>
      viewProject(
        {
          profile: open(),
          store,
          tmux,
          ...terminal,
          wezTermNewTab: open().config.terminal.wezTermNewTab,
        },
        project,
        app ? terminalApp() : undefined,
      ),
  };
}
