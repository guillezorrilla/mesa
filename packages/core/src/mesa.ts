import { about } from './about/about.js';
import { hooksService } from './agents/hooks-service.js';
import { automationsService } from './automations/service.js';
import { automationState } from './automations/state.js';
import { createContext, type MesaDeps } from './context.js';
import { dailyService } from './daily/service.js';
import { createFaro } from './decisions/faro.js';
import { diagnosticsService } from './diagnostics/service.js';
import { doctorService } from './doctor/service.js';
import { filesService } from './files/service.js';
import { gitService } from './git/service.js';
import { instructionsService } from './instructions/service.js';
import { mapService } from './map/service.js';
import { backgroundDelivery } from './notifications/background.js';
import { inbox } from './notifications/inbox.js';
import { prEventsService } from './pr-events/pr-event-delivery.js';
import { backupService } from './profile/backup.js';
import { profileService } from './profile/service.js';
import { projectsService } from './projects/service.js';
import { promptsService } from './prompts/prompts.js';
import { receiptsService } from './receipts/service.js';
import { sessionsService } from './sessions/service.js';
import { skillsService } from './skills/service.js';
import { importService } from './sources/import-service.js';
import { itemSessions } from './sources/item-session.js';
import { sourcesService } from './sources/service.js';
import { updateService } from './update/service.js';
import { rewindService } from './usage/rewind.js';
import { usageService } from './usage/service.js';
import { statusLineService } from './usage/statusline.js';
import { vaultChoices } from './vault/obsidian.js';
import { vaultService } from './vault/service.js';
import { listWorktrees } from './worktrees/inventory.js';
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
  // Failed automation runs are notices; the inbox reads them from the run ledger.
  const notices = inbox(ctx, () => automationState(ctx.paths.automationState, ctx).read().runs);
  const notifications = { ...notices, deliver: () => backgroundDelivery(ctx, notices) };
  const usage = usageService(ctx);
  const vaults = vaultService(ctx);
  const prompts = promptsService(ctx);
  const sessions = sessionsService(ctx, faro, skills, profileApi.config.set);
  const sources = sourcesService(ctx);
  const imports = importService(ctx, {
    fetch: sources.fetch,
    sites: sources.sites,
    run: sessions.sessions.run,
  });
  return {
    about: () => about(deps.version, deps.release),
    ...profileApi,
    backup: backupService(ctx, prompts.list),
    projects: projectsService(ctx),
    automations: automationsService(ctx, faro, {
      sessions: sessions.sessions,
      refresh: imports.refresh,
      notify: notifications.deliver,
    }),
    prompts,
    files: filesService(ctx),
    worktrees: worktreesService(ctx),
    git: gitService(
      ctx,
      faro,
      async (opened, project) => (await listWorktrees(opened, ctx.run, ctx.store, project)).length,
    ),
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
    update: updateService(ctx, profileApi.config),
    instructions: instructionsService(ctx),
    sources,
    imports: { ...imports, ...itemSessions(imports.item, sessions.sessions.open) },
    decide: faro.decide,
    guardrail: { check: faro.guardrail.check },
    /** Where a first vault can go (`mesa obsidian vaults`): needs no profile. */
    vaultChoices: () => vaultChoices(deps.obsidian, deps.home),
    ...doctorService(ctx, {
      faro,
      vaultStatus: vaults.vault.status,
      recordDoctor: notifications.recordDoctor,
    }),
  };
}

export type Mesa = ReturnType<typeof createMesa>;
