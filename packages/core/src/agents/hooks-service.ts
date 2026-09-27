import type { MesaContext } from '../context.js';
import type { ClaudeHooksStatus } from './claude/hooks.js';
import { hooksStatus, installHooks, uninstallHooks } from './claude/hooks.js';
import * as codex from './codex/hooks.js';
import { codexHome } from './codex/paths.js';

export type TmuxHookStatus = { socket: string; server: boolean; paneDied: boolean };
export type HooksStatus = ClaudeHooksStatus & {
  codex: codex.CodexHooksStatus;
  tmux: TmuxHookStatus;
};

/** Mesa's agent hooks and the pane-died hook on the profile's tmux server. */
export function hooksService(ctx: MesaContext) {
  const { record, deps } = ctx;
  const home = codexHome(deps.env, deps.home);
  const change = (install: boolean) => {
    // Validate both before changing either file, including Codex's read-only trust config.
    hooksStatus(deps.home, deps.self);
    codex.hooksStatus(home, deps.self);
    const claude = (install ? installHooks : uninstallHooks)(deps.home, deps.self);
    const result = (install ? codex.installHooks : codex.uninstallHooks)(home, deps.self);
    return { ...claude, codex: result, changed: claude.changed || result.changed };
  };
  return {
    status: async () => ({
      ...hooksStatus(deps.home, deps.self),
      codex: codex.hooksStatus(home, deps.self),
      tmux: await ctx.tmuxHook(),
    }),
    /** Adds both agents' entries; running it twice leaves one per event. */
    install: () =>
      record(
        {
          summary: () => "Installed Mesa's agent hooks",
          failure: "Could not install Mesa's agent hooks",
          inputs: {},
          outputs: (r) => ({ path: r.path, codexPath: r.codex.path }),
          changed: (r) => r.changed,
        },
        () => change(true),
      ),
    uninstall: () =>
      record(
        {
          summary: () => "Removed Mesa's agent hooks",
          failure: "Could not remove Mesa's agent hooks",
          inputs: {},
          outputs: (r) => ({ path: r.path, codexPath: r.codex.path }),
          changed: (r) => r.changed,
        },
        () => change(false),
      ),
  };
}
