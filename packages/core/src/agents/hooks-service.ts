import type { MesaContext } from '../context.js';
import * as antigravity from './antigravity/hooks.js';
import * as antigravityVault from './antigravity/vault-mount.js';
import type { ClaudeHooksStatus } from './claude/hooks.js';
import { hooksStatus, installHooks, uninstallHooks } from './claude/hooks.js';
import * as codex from './codex/hooks.js';
import { codexHome } from './codex/paths.js';

export type TmuxHookStatus = { socket: string; server: boolean; paneDied: boolean };
export type HooksStatus = ClaudeHooksStatus & {
  codex: codex.CodexHooksStatus;
  antigravity: ReturnType<typeof antigravity.hooksStatus>;
  antigravityVault: ReturnType<typeof antigravityVault.vaultMountStatus>;
  tmux: TmuxHookStatus;
};

/**
 * Mesa's agent hooks, Antigravity's global mesa-vault entry and allow rule, and the pane-died
 * hook on the profile's tmux server.
 */
export function hooksService(ctx: MesaContext) {
  const { record, deps } = ctx;
  const home = codexHome(deps.env, deps.home);
  const change = (install: boolean) => {
    // Validate every file before changing any, including Codex's read-only trust config.
    hooksStatus(deps.home, deps.self);
    codex.hooksStatus(home, deps.self);
    antigravity.hooksStatus(deps.home, deps.self);
    // Antigravity's vault files are not checked here: a conflict there is reported, not thrown.
    const claude = (install ? installHooks : uninstallHooks)(deps.home, deps.self);
    const result = (install ? codex.installHooks : codex.uninstallHooks)(home, deps.self);
    const agy = (install ? antigravity.installHooks : antigravity.uninstallHooks)(
      deps.home,
      deps.self,
    );
    const vault = (
      install ? antigravityVault.installVaultMount : antigravityVault.uninstallVaultMount
    )(deps.home, deps.self);
    return {
      ...claude,
      codex: result,
      antigravity: agy,
      antigravityVault: vault,
      changed: claude.changed || result.changed || agy.changed || vault.changed,
    };
  };
  return {
    status: async () => ({
      ...hooksStatus(deps.home, deps.self),
      codex: codex.hooksStatus(home, deps.self),
      antigravity: antigravity.hooksStatus(deps.home, deps.self),
      antigravityVault: antigravityVault.vaultMountStatus(deps.home, deps.self),
      tmux: await ctx.tmuxHook(),
    }),
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
          warning: (r) => r.antigravityVault.conflict,
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
          warning: (r) => r.antigravityVault.conflict,
        },
        () => change(false),
      ),
  };
}
