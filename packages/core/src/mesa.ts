import { about } from './about/about.js';
import { hooksService } from './agents/hooks-service.js';
import { automationsService } from './automations/service.js';
import { runCheck } from './checks/check.js';
import { createContext, type MesaDeps } from './context.js';
import { dailyService } from './daily/service.js';
import { createFaro } from './decisions/faro.js';
import { decisionModels } from './decisions/models.js';
import { decisionAssistance } from './decisions/service.js';
import { boardPlacing } from './decisions/supervision.js';
import { diagnosticsService } from './diagnostics/service.js';
import { doctorService } from './doctor/service.js';
import { feedbackService } from './feedback/service.js';
import { filesService } from './files/service.js';
import { gitService } from './git/service.js';
import { impactService } from './impact/service.js';
import { installsService } from './installs/service.js';
import { instructionsService } from './instructions/service.js';
import { mapService } from './map/service.js';
import { backgroundDelivery } from './notifications/background.js';
import { inbox } from './notifications/inbox.js';
import { phoneService } from './phone/service.js';
import { prEventsService } from './pr-events/pr-event-delivery.js';
import { backupService } from './profile/backup.js';
import { profilesService } from './profile/profiles.js';
import { profileService } from './profile/service.js';
import { projectsService } from './projects/service.js';
import { promptsService } from './prompts/prompts.js';
import { prsService } from './prs/service.js';
import { receiptsService } from './receipts/service.js';
import { whatsNew } from './release/notes.js';
import { reportsService } from './reports/report-delivery.js';
import { sessionsService } from './sessions/service/index.js';
import { skillsService } from './skills/service.js';
import { importService } from './sources/import-service.js';
import { itemSessions } from './sources/item-session.js';
import { sourcesService } from './sources/service.js';
import { gatesService } from './tasks/gates.js';
import { tasksService } from './tasks/tasks.js';
import { ticketsService } from './tickets/service.js';
import { updateService } from './update/service.js';
import { rewindService } from './usage/rewind.js';
import { usageService } from './usage/service.js';
import { statusLineService } from './usage/statusline.js';
import { openVaultManager, vaultChoices } from './vault/obsidian.js';
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
  const models = decisionModels(ctx);
  const faro = createFaro(ctx, models);
  const skills = skillsService(ctx);
  const profileApi = profileService(ctx);
  const usage = usageService(ctx);
  const prompts = promptsService(ctx);
  const assistance = decisionAssistance(ctx, faro);
  const sessions = sessionsService(ctx, faro, skills, profileApi.config.set, assistance);
  const vaults = vaultService(ctx, { run: sessions.sessions.run });
  const sources = sourcesService(ctx);
  const imports = importService(ctx, {
    fetch: sources.fetch,
    sites: sources.sites,
    run: sessions.sessions.run,
  });
  const tickets = ticketsService(ctx, {
    fetch: sources.fetch,
    sites: sources.sites,
    prompts: prompts.list,
  });
  const automations = automationsService(ctx, faro, {
    sessions: sessions.sessions,
    refresh: imports.refresh,
    notify: () => notifications.deliver(),
  });
  /** Child sessions' news, typed into their idle parents (CONTEXT.md, Child report). */
  const reports = reportsService(ctx, {
    board: () => sessions.sessions.list(),
    send: sessions.sessions.send,
  });
  const gates = gatesService(ctx, { report: reports.gate });
  // Failed automation runs and open gates are notices; the inbox reads them from their owners.
  const notices = inbox(ctx, automations.runs, gates.open);
  const notifications = { ...notices, deliver: () => backgroundDelivery(ctx, notices) };
  const worktrees = worktreesService(ctx);
  const installs = installsService(ctx);
  return {
    about: () => about(deps.version, deps.release),
    /** A person's feedback, sent through the broker to a private repo (ADR-0025). */
    feedback: feedbackService(ctx),
    /** The profile's Pairing with a phone, through the broker (ADR-0027). */
    phone: phoneService(ctx, {
      board: () => sessions.sessions.list(),
      responses: (id) => sessions.sessions.responses.list(id),
      logs: (id, tail) => sessions.sessions.logs(id, tail),
      read: sessions.sessions.read,
      unread: sessions.sessions.unread,
    }),
    /** The anonymous install count and its switch (ADR-0026). */
    installs: { status: installs.status, set: installs.set },
    /** A version's release notes, the running one's by default. */
    whatsNew: (version = deps.version) => whatsNew(deps.changelog, version),
    ...profileApi,
    profiles: profilesService(ctx),
    backup: backupService(ctx, prompts.list),
    projects: projectsService(ctx),
    automations,
    prompts,
    files: filesService(ctx),
    /** A project's checks, run for an agent: one line, or the errors (CONTEXT.md, Check). */
    check: (project: string, opts?: Parameters<typeof runCheck>[2]) => runCheck(ctx, project, opts),
    worktrees,
    git: gitService(ctx, faro, worktrees.count, sessions.sessions.run, {
      board: () => sessions.sessions.list(),
      send: sessions.sessions.send,
      open: async (project, opts) => (await sessions.sessions.open(project, opts)).result,
    }),
    ...vaults,
    ...mapService(ctx),
    ...dailyService(ctx),
    receipts: receiptsService(ctx),
    ...sessions,
    prEvents: prEventsService(ctx, {
      board: () => sessions.sessions.list(),
      send: sessions.sessions.send,
    }),
    reports,
    /** Planned work and what each part waits on (CONTEXT.md, Task graph). */
    tasks: tasksService(ctx, { startWorker: sessions.sessions.worker }),
    /** Decisions only a person makes, which block a task until resolved (CONTEXT.md, Decision gate). */
    gates,
    prs: prsService(ctx, { open: sessions.sessions.open, stop: sessions.sessions.stop }),
    hooks: hooksService(ctx),
    skills,
    usage,
    rewind: rewindService(ctx, usage),
    /** What Mesa decided and kept, and what happened next (CONTEXT.md, Impact). */
    impact: impactService(ctx),
    statusLine: statusLineService(ctx),
    notifications,
    diagnostics: diagnosticsService(ctx),
    update: updateService(ctx, profileApi.config, installs.ping),
    instructions: instructionsService(ctx),
    sources,
    imports: {
      ...imports,
      ...itemSessions(imports.item, sessions.sessions.open, tickets.promptFor),
    },
    tickets,
    decide: faro.decide,
    /**
     * The hosted decision models: their keys and which one Faro asks (#488), placing the sessions
     * the Board is unsure of beside its read (#461), and the decision assistance sessions get (#462).
     */
    decisions: {
      keys: models.keys,
      use: models.use,
      place: boardPlacing(ctx, models),
      ...assistance,
    },
    guardrail: { check: faro.guardrail.check },
    /** Where a first vault can go (`mesa obsidian vaults`): needs no profile. */
    vaultChoices: () => vaultChoices(deps.obsidian, deps.home),
    /** Obsidian's vault manager, to add a vault it does not know (`mesa obsidian manager`). */
    openVaultManager: () => openVaultManager(ctx.run),
    ...doctorService(ctx, {
      faro,
      vaultStatus: vaults.vault.status,
      recordDoctor: notifications.recordDoctor,
    }),
  };
}

export type Mesa = ReturnType<typeof createMesa>;
