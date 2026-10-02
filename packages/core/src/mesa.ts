import { existsSync } from 'node:fs';
import { hooksStatus as antigravityHooksStatus } from './agents/antigravity/hooks.js';
import { vaultMountStatus } from './agents/antigravity/vault-mount.js';
import { hooksStatus } from './agents/claude/hooks.js';
import { hooksStatus as codexHooksStatus } from './agents/codex/hooks.js';
import { codexDaemonSocket, codexHome } from './agents/codex/paths.js';
import { hooksService } from './agents/hooks-service.js';
import { automationsService } from './automations/service.js';
import { createContext, type MesaDeps } from './context.js';
import { dailyService } from './daily/service.js';
import { createFaro } from './decisions/faro.js';
import { diagnosticsService } from './diagnostics/service.js';
import { inboxCheck, runDoctor } from './doctor.js';
import { filesService } from './files/service.js';
import { prEventsService } from './git/pr-event-delivery.js';
import { gitService } from './git/service.js';
import { mapService } from './map/service.js';
import { inbox } from './notifications/inbox.js';
import { profileService } from './profile/service.js';
import { projectsService } from './projects/service.js';
import { promptsService } from './prompts/prompts.js';
import { receiptsService } from './receipts/service.js';
import { rulesService } from './rules/service.js';
import { sessionsService } from './sessions/service.js';
import { skillsService } from './skills/service.js';
import { importService } from './sources/import-service.js';
import { itemSessions } from './sources/item-session.js';
import { sourcesService } from './sources/service.js';
import { rewindService } from './usage/rewind.js';
import { usageService } from './usage/service.js';
import { statusLineService } from './usage/statusline.js';
import { vaultService } from './vault/service.js';
import { worktreesService } from './worktrees/service.js';

export type { MesaDeps } from './context.js';

/**
 * The composition root: every Mesa service for one profile, wired to `deps`. Each domain builds
 * its own services over one shared context (ADR-0008); this only composes them. The CLI builds
 * one per invocation; tests build one over a temp home.
 */
export function createMesa(profile: string, deps: MesaDeps) {
  const ctx = createContext(profile, deps);
  const faro = createFaro(ctx);
  const skills = skillsService(ctx);
  const profileApi = profileService(ctx);
  const notifications = inbox(ctx);
  const usage = usageService(ctx);
  const vaults = vaultService(ctx);
  const sessions = sessionsService(ctx, faro, skills);
  const sources = sourcesService(ctx);
  const imports = importService(ctx, {
    fetch: sources.fetch,
    sites: sources.sites,
    run: sessions.sessions.run,
  });
  return {
    ...profileApi,
    projects: projectsService(ctx),
    automations: automationsService(ctx, faro, {
      sessions: sessions.sessions,
      refresh: imports.refresh,
    }),
    prompts: promptsService(ctx),
    files: filesService(ctx),
    worktrees: worktreesService(ctx),
    git: gitService(ctx, faro),
    ...vaults,
    ...mapService(ctx),
    ...dailyService(ctx),
    receipts: receiptsService(ctx),
    ...sessions,
    prEvents: prEventsService(ctx, {
      board: () => sessions.sessions.list(),
      send: sessions.sessions.send,
    }),
    hooks: hooksService(ctx),
    skills,
    usage,
    rewind: rewindService(ctx, usage),
    statusLine: statusLineService(ctx),
    notifications,
    diagnostics: diagnosticsService(ctx),
    rules: rulesService(ctx),
    sources,
    imports: { ...imports, ...itemSessions(imports.item, sessions.sessions.open) },
    decide: faro.decide,
    guardrail: { check: faro.guardrail.check },
    doctor: async () => {
      const report = await runDoctor({
        run: deps.run,
        obsidian: deps.obsidian,
        profileDir: ctx.paths.root,
        decisions: faro.inUse(),
        hooks: {
          claude: () => hooksStatus(deps.home, deps.self),
          codex: () => codexHooksStatus(codexHome(deps.env, deps.home), deps.self),
          antigravity: () => antigravityHooksStatus(deps.home, deps.self),
          antigravityVault: () => vaultMountStatus(deps.home, deps.self),
          tmux: ctx.tmuxHook,
        },
        codexDaemon: codexDaemonSocket(codexHome(deps.env, deps.home)),
        ...(existsSync(ctx.paths.config) ? { vault: vaults.vault.status } : {}),
      });
      // A profile that was never initialised has no inbox: doctor must not create its folder.
      if (!existsSync(ctx.paths.config)) return report;
      try {
        notifications.recordDoctor(report);
        return report;
      } catch (error) {
        return { ...report, checks: [...report.checks, inboxCheck(error)] };
      }
    },
  };
}

export type Mesa = ReturnType<typeof createMesa>;
