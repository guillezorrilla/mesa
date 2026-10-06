import type { MesaContext } from '../../context.js';
import type { profileService } from '../../profile/service.js';
import { attachSession } from '../attach.js';
import { type GridGroup, removeGridGroup, saveGridGroup } from '../grid-groups.js';
import { resizeSession } from '../resize.js';
import { viewProject } from '../view.js';
import type { SessionDeps } from './deps.js';

/** Where a session is seen: its tmux window sized, attached, or laid out with its project's. */
export function windowActions(ctx: MesaContext, deps: SessionDeps) {
  const { open, store, tmux } = ctx;
  const { terminal, terminalApp, ensureBackgroundView } = deps;
  return {
    /** Sizes a session's window to a view now (the app's terminal, after each fit). */
    resize: (id: string, cols: number, rows: number) =>
      resizeSession({ store, tmux }, id, cols, rows),
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

/** The app grid's named groups of sessions, kept as the profile's config value `grid.groups`. */
export function gridActions(
  ctx: MesaContext,
  /** The profile service's config.set: the grid's groups are a config value. */
  setConfig: ReturnType<typeof profileService>['config']['set'],
) {
  const { open } = ctx;
  return {
    list: () => open().config.grid.groups,
    save: (group: GridGroup) => {
      const groups = saveGridGroup(open().config.grid.groups, group);
      const recorded = setConfig('grid.groups', JSON.stringify(groups));
      return { ...recorded, result: { groups } };
    },
    remove: (name: string) => {
      const groups = removeGridGroup(open().config.grid.groups, name);
      const recorded = setConfig('grid.groups', JSON.stringify(groups));
      return { ...recorded, result: { groups } };
    },
  };
}
