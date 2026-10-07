import { existsSync } from 'node:fs';
import { hooksStatus as antigravityHooksStatus } from '../agents/antigravity/hooks.js';
import { vaultMountStatus } from '../agents/antigravity/vault-mount.js';
import { hooksStatus } from '../agents/claude/hooks.js';
import { hooksStatus as codexHooksStatus } from '../agents/codex/hooks.js';
import { codexDaemonSocket, codexHome } from '../agents/codex/paths.js';
import type { MesaContext } from '../context.js';
import type { Faro } from '../decisions/faro.js';
import type { VaultStatus } from '../vault/vault.js';
import { type DoctorReport, inboxCheck, runDoctor } from './doctor.js';
import { installRequirement } from './install.js';

/**
 * The profile's doctor: every check wired to the profile's hooks, decision model, and vault,
 * its findings recorded in the inbox; and installing a missing requirement.
 */
export function doctorService(
  ctx: MesaContext,
  deps: {
    faro: Pick<Faro, 'inUse'>;
    vaultStatus: () => VaultStatus;
    recordDoctor: (report: DoctorReport) => void;
  },
) {
  return {
    /** Installs a missing tmux or agent with Homebrew (`mesa doctor install`). */
    installRequirement: (name: string) => installRequirement(ctx.run, name),
    doctor: async () => {
      const report = await runDoctor({
        run: ctx.run,
        obsidian: ctx.obsidian,
        profileDir: ctx.paths.root,
        decisions: deps.faro.inUse(),
        hooks: {
          claude: () => hooksStatus(ctx.home, ctx.env, ctx.self),
          codex: () => codexHooksStatus(codexHome(ctx.home, ctx.env), ctx.self),
          antigravity: () => antigravityHooksStatus(ctx.home, ctx.self),
          antigravityVault: () => vaultMountStatus(ctx.home, ctx.self),
          tmux: ctx.tmuxHook,
        },
        codexDaemon: codexDaemonSocket(codexHome(ctx.home, ctx.env)),
        ...(existsSync(ctx.paths.config) ? { vault: deps.vaultStatus } : {}),
      });
      // A profile that was never initialised has no inbox: doctor must not create its folder.
      if (!existsSync(ctx.paths.config)) return report;
      try {
        deps.recordDoctor(report);
        return report;
      } catch (error) {
        return { ...report, checks: [...report.checks, inboxCheck(error)] };
      }
    },
  };
}
