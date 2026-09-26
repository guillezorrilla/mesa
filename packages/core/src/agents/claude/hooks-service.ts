import type { MesaContext } from '../../context.js';
import { hooksStatus, installHooks, uninstallHooks } from './hooks.js';

/** Mesa's hooks: Claude Code's, in its settings, and the pane-died one on Mesa's tmux server. */
export function hooksService(ctx: MesaContext) {
  const { record, deps } = ctx;
  return {
    status: async () => ({ ...hooksStatus(deps.home, deps.self), tmux: await ctx.tmuxHook() }),
    /** Adds Mesa's entries to ~/.claude/settings.json; running it twice leaves one per event. */
    install: () =>
      record(
        {
          summary: () => "Installed Mesa's Claude Code hooks",
          failure: "Could not install Mesa's Claude Code hooks",
          inputs: {},
          outputs: (r) => ({ path: r.path }),
          changed: (r) => r.changed,
        },
        () => installHooks(deps.home, deps.self),
      ),
    uninstall: () =>
      record(
        {
          summary: () => "Removed Mesa's Claude Code hooks",
          failure: "Could not remove Mesa's Claude Code hooks",
          inputs: {},
          outputs: (r) => ({ path: r.path }),
          changed: (r) => r.changed,
        },
        () => uninstallHooks(deps.home, deps.self),
      ),
  };
}
