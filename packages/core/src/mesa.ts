import { hooksStatus } from './agents/claude/hooks.js';
import { hooksService } from './agents/claude/hooks-service.js';
import { createContext, type MesaDeps } from './context.js';
import { createFaro } from './decisions/faro.js';
import { runDoctor } from './doctor.js';
import { profileService } from './profile/service.js';
import { projectsService } from './projects/service.js';
import { receiptsService } from './receipts/service.js';
import { sessionsService } from './sessions/service.js';
import { vaultService } from './vault/service.js';

export type { MesaDeps } from './context.js';

/**
 * The composition root: every Mesa service for one profile, wired to `deps`. Each domain builds
 * its own services over one shared context (ADR-0008); this only composes them. The CLI builds
 * one per invocation; tests build one over a temp home.
 */
export function createMesa(profile: string, deps: MesaDeps) {
  const ctx = createContext(profile, deps);
  const faro = createFaro(ctx);
  return {
    ...profileService(ctx),
    projects: projectsService(ctx),
    ...vaultService(ctx),
    receipts: receiptsService(ctx),
    ...sessionsService(ctx, faro),
    hooks: hooksService(ctx),
    decide: faro.decide,
    doctor: () =>
      runDoctor({
        run: deps.run,
        obsidian: deps.obsidian,
        profileDir: ctx.paths.root,
        decisions: faro.inUse(),
        hooks: { claude: () => hooksStatus(deps.home, deps.self), tmux: ctx.tmuxHook },
      }),
  };
}

export type Mesa = ReturnType<typeof createMesa>;
