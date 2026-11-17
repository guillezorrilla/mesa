import type { MesaContext } from '../context.js';
import * as antigravity from './antigravity/hooks.js';
import * as antigravityMount from './antigravity/mesa-mount.js';
import type { ClaudeHooksStatus } from './claude/hooks.js';
import { hooksStatus, installHooks, uninstallHooks } from './claude/hooks.js';
import * as codex from './codex/hooks.js';
import { codexHome } from './codex/paths.js';

export type TmuxHookStatus = { socket: string; server: boolean; paneDied: boolean };
export type HooksStatus = ClaudeHooksStatus & {
  codex: codex.CodexHooksStatus;
  antigravity: ReturnType<typeof antigravity.hooksStatus>;
  /** Antigravity's mesa-vault and mesa-decisions entries, which install now removes (ADR-0031). */
  antigravityMounts: antigravityMount.MesaMountStatus;
  tmux: TmuxHookStatus;
  /** Mesa's hooks were installed once and `mesa hooks install` would now update them. */
  needsUpdate: boolean;
};

/**
 * Whether Mesa's hooks were installed once and are out of date (#678): an agent's entries run
 * another command or miss an event, Codex lacks Mesa's rules file, or Antigravity still has
 * Mesa's old MCP entries. Never when Mesa's hooks were never installed.
 */
function needsUpdate(s: Omit<HooksStatus, 'tmux' | 'needsUpdate'>) {
  const agents = [s, s.codex, s.antigravity];
  const once = agents.some((agent) => agent.installed || agent.stale);
  return (
    agents.some((agent) => agent.stale) ||
    (s.codex.installed && !s.codex.rules) ||
    (once && s.antigravityMounts.left)
  );
}

/**
 * Mesa's agent hooks, Codex's rules file for Mesa's commands, and the pane-died hook on the
 * profile's tmux server; install and uninstall both remove Antigravity's old mesa-vault and
 * mesa-decisions entries, as sessions use the mesa CLI instead (ADR-0031).
 */
export function hooksService(ctx: MesaContext) {
  const { record } = ctx;
  const home = codexHome(ctx.home, ctx.env);
  const change = (install: boolean) => {
    // Validate every file before changing any, including Codex's read-only trust config.
    hooksStatus(ctx.home, ctx.env, ctx.self);
    codex.hooksStatus(home, ctx.self);
    antigravity.hooksStatus(ctx.home, ctx.self);
    // Antigravity's MCP files are not checked here: a conflict there is reported, not thrown.
    const claude = (install ? installHooks : uninstallHooks)(ctx.home, ctx.env, ctx.self);
    const result = (install ? codex.installHooks : codex.uninstallHooks)(home, ctx.self);
    const agy = (install ? antigravity.installHooks : antigravity.uninstallHooks)(
      ctx.home,
      ctx.self,
    );
    const mounts = antigravityMount.removeMesaMounts(ctx.home);
    return {
      ...claude,
      codex: result,
      antigravity: agy,
      antigravityMounts: mounts,
      changed: claude.changed || result.changed || agy.changed || mounts.changed,
    };
  };
  return {
    status: async (): Promise<HooksStatus> => {
      const files = {
        ...hooksStatus(ctx.home, ctx.env, ctx.self),
        codex: codex.hooksStatus(home, ctx.self),
        antigravity: antigravity.hooksStatus(ctx.home, ctx.self),
        antigravityMounts: antigravityMount.mesaMountStatus(ctx.home),
      };
      return { ...files, tmux: await ctx.tmuxHook(), needsUpdate: needsUpdate(files) };
    },
    /** Adds every agent's entries; running it twice leaves one per event, entry, and rule. */
    install: () =>
      record(
        {
          summary: () => "Installed Mesa's agent hooks",
          failure: "Could not install Mesa's agent hooks",
          inputs: {},
          outputs: (r) => ({
            path: r.path,
            codexPath: r.codex.path,
            antigravityPath: r.antigravity.path,
            codexRulesPath: r.codex.rulesPath,
            antigravityMcpPath: r.antigravityMounts.path,
            antigravityRulePath: r.antigravityMounts.rulePath,
          }),
          changed: (r) => r.changed,
          warning: (r) => r.antigravityMounts.conflict,
        },
        () => change(true),
      ),
    uninstall: () =>
      record(
        {
          summary: () => "Removed Mesa's agent hooks",
          failure: "Could not remove Mesa's agent hooks",
          inputs: {},
          outputs: (r) => ({
            path: r.path,
            codexPath: r.codex.path,
            antigravityPath: r.antigravity.path,
            codexRulesPath: r.codex.rulesPath,
            antigravityMcpPath: r.antigravityMounts.path,
            antigravityRulePath: r.antigravityMounts.rulePath,
          }),
          changed: (r) => r.changed,
          warning: (r) => r.antigravityMounts.conflict,
        },
        () => change(false),
      ),
  };
}
