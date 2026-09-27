import { hooksStatus } from './agents/claude/hooks.js';
import { hooksStatus as codexHooksStatus } from './agents/codex/hooks.js';
import { codexDaemonSocket, codexHome } from './agents/codex/paths.js';
import { hooksService } from './agents/hooks-service.js';
import { createContext, type MesaDeps } from './context.js';
import { createFaro } from './decisions/faro.js';
import { runDoctor } from './doctor.js';
import { profileService } from './profile/service.js';
import { projectsService } from './projects/service.js';
import { receiptsService } from './receipts/service.js';
import { sessionsService } from './sessions/service.js';
import { skillsService } from './skills/service.js';
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
  const skills = skillsService(ctx);
  return {
    ...profileService(ctx),
    projects: projectsService(ctx),
    ...vaultService(ctx),
    receipts: receiptsService(ctx),
    ...sessionsService(ctx, faro, skills),
    hooks: hooksService(ctx),
    skills,
    decide: faro.decide,
    guardrail: { check: faro.guardrail.check },
    doctor: () =>
      runDoctor({
        run: deps.run,
        obsidian: deps.obsidian,
        profileDir: ctx.paths.root,
        decisions: faro.inUse(),
        hooks: {
          claude: () => hooksStatus(deps.home, deps.self),
          codex: () => codexHooksStatus(codexHome(deps.env, deps.home), deps.self),
          tmux: ctx.tmuxHook,
        },
        codexDaemon: codexDaemonSocket(codexHome(deps.env, deps.home)),
      }),
  };
}

export type Mesa = ReturnType<typeof createMesa>;
