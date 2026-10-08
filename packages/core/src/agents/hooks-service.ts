import type { MesaContext } from '../context.js';
import { joinWarnings } from '../receipts/recorder.js';
import * as antigravity from './antigravity/hooks.js';
import * as antigravityMount from './antigravity/mesa-mount.js';
import type { ClaudeHooksStatus } from './claude/hooks.js';
import { hooksStatus, installHooks, uninstallHooks } from './claude/hooks.js';
import * as codex from './codex/hooks.js';
import { codexHome } from './codex/paths.js';
import { DECISIONS_MOUNT } from './mesa-mount.js';

export type TmuxHookStatus = { socket: string; server: boolean; paneDied: boolean };
/**
 * Antigravity's mesa-decisions entry and rule (#463), owned as mesa-vault's are, and whether the
 * profile wants them: only while it has a Decision model.
 */
export type AntigravityDecisionsStatus = antigravityMount.MesaMountStatus & { wanted: boolean };
export type HooksStatus = ClaudeHooksStatus & {
  codex: codex.CodexHooksStatus;
  antigravity: ReturnType<typeof antigravity.hooksStatus>;
  antigravityVault: antigravityMount.MesaMountStatus;
  antigravityDecisions: AntigravityDecisionsStatus;
  tmux: TmuxHookStatus;
  /** Mesa's hooks were installed once and `mesa hooks install` would now update them. */
  needsUpdate: boolean;
};

/**
 * Whether Mesa's hooks were installed once and are out of date (#678): an agent's entries run
 * another command or miss an event, Antigravity's mesa-vault entry is stale, or a profile with a
 * Decision model has no mesa-decisions entry yet. Never when Mesa's hooks were never installed.
 */
function needsUpdate(s: Omit<HooksStatus, 'tmux' | 'needsUpdate'>) {
  const agents = [s, s.codex, s.antigravity];
  const once = agents.some((agent) => agent.installed || agent.stale);
  const decisions = s.antigravityDecisions;
  const unmounted = decisions.wanted && !decisions.installed && !decisions.conflict;
  return agents.some((agent) => agent.stale) || s.antigravityVault.stale || (once && unmounted);
}

/** A conflict in Antigravity's Mesa entries, named once when both have the same one. */
const mountConflicts = (r: Pick<HooksStatus, 'antigravityVault' | 'antigravityDecisions'>) =>
  joinWarnings(...new Set([r.antigravityVault.conflict, r.antigravityDecisions.conflict]));

/**
 * Mesa's agent hooks, Antigravity's global mesa-vault and mesa-decisions entries and allow rules,
 * and the pane-died hook on the profile's tmux server. With no Decision model nothing of
 * mesa-decisions is mounted (#463): install writes no entry for it and removes Mesa's own.
 */
export function hooksService(ctx: MesaContext) {
  const { record } = ctx;
  const home = codexHome(ctx.home, ctx.env);
  /** Whether the profile has a Decision model (only one whose key is set can be chosen). */
  const wanted = () => (ctx.configIfAny()?.decisions.model ?? 'none') !== 'none';
  /** Antigravity's mesa-decisions entry and rule while the profile wants them, else none. */
  const installDecisions = () => {
    const want = wanted();
    const mount = want
      ? antigravityMount.installMesaMount(ctx.home, ctx.self, DECISIONS_MOUNT)
      : antigravityMount.uninstallMesaMount(ctx.home, ctx.self, DECISIONS_MOUNT);
    return { ...mount, wanted: want };
  };
  /** Removes Antigravity's mesa-decisions entry and rule, whatever the profile wants. */
  const uninstallDecisions = () => ({
    ...antigravityMount.uninstallMesaMount(ctx.home, ctx.self, DECISIONS_MOUNT),
    wanted: wanted(),
  });
  const change = (install: boolean) => {
    // Validate every file before changing any, including Codex's read-only trust config.
    hooksStatus(ctx.home, ctx.env, ctx.self);
    codex.hooksStatus(home, ctx.self);
    antigravity.hooksStatus(ctx.home, ctx.self);
    // Antigravity's vault files are not checked here: a conflict there is reported, not thrown.
    const claude = (install ? installHooks : uninstallHooks)(ctx.home, ctx.env, ctx.self);
    const result = (install ? codex.installHooks : codex.uninstallHooks)(home, ctx.self);
    const agy = (install ? antigravity.installHooks : antigravity.uninstallHooks)(
      ctx.home,
      ctx.self,
    );
    const mount = install ? antigravityMount.installMesaMount : antigravityMount.uninstallMesaMount;
    const vault = mount(ctx.home, ctx.self);
    const decisions = install ? installDecisions() : uninstallDecisions();
    return {
      ...claude,
      codex: result,
      antigravity: agy,
      antigravityVault: vault,
      antigravityDecisions: decisions,
      changed:
        claude.changed || result.changed || agy.changed || vault.changed || decisions.changed,
    };
  };
  return {
    status: async (): Promise<HooksStatus> => {
      const files = {
        ...hooksStatus(ctx.home, ctx.env, ctx.self),
        codex: codex.hooksStatus(home, ctx.self),
        antigravity: antigravity.hooksStatus(ctx.home, ctx.self),
        antigravityVault: antigravityMount.mesaMountStatus(ctx.home, ctx.self),
        antigravityDecisions: {
          ...antigravityMount.mesaMountStatus(ctx.home, ctx.self, DECISIONS_MOUNT),
          wanted: wanted(),
        },
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
            antigravityMcpPath: r.antigravityVault.path,
            antigravityRulePath: r.antigravityVault.rulePath,
          }),
          changed: (r) => r.changed,
          warning: mountConflicts,
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
            antigravityMcpPath: r.antigravityVault.path,
            antigravityRulePath: r.antigravityVault.rulePath,
          }),
          changed: (r) => r.changed,
          warning: mountConflicts,
        },
        () => change(false),
      ),
  };
}
