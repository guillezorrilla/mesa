import type { MesaContext } from '../../context.js';
import type { Faro } from '../../decisions/faro.js';
import { continueActions } from './continue.js';
import { type SessionSkills, sessionDeps } from './deps.js';
import { gridActions, type SetConfig } from './grid.js';
import { inputActions } from './input.js';
import { inspectActions } from './inspect.js';
import { lifecycleActions } from './lifecycle.js';
import { windowActions } from './windows.js';

/**
 * Every session action, each with its receipt, plus the hooks' entry points and the tmux
 * windows: the Session Board's side of Mesa for one profile.
 */
export function sessionsService(
  ctx: MesaContext,
  faro: Faro,
  /** The skills service's: links a project's enabled skills into a folder, and lists what it sees. */
  skills: SessionSkills,
  setConfig: SetConfig,
) {
  const deps = sessionDeps(ctx, faro, skills);
  const lifecycle = lifecycleActions(ctx, faro, deps);
  return {
    grid: gridActions(ctx, setConfig),
    sessions: {
      ...inspectActions(ctx, deps, lifecycle.stop),
      ...inputActions(ctx, faro, deps),
      ...lifecycle,
      ...continueActions(ctx, deps, lifecycle.stop),
      ...windowActions(ctx, deps),
    },
    hookEvent: deps.ends.hookEvent,
    antigravityInstruction: deps.ends.antigravityInstruction,
    tmuxEvent: deps.ends.tmuxEvent,
    /** The windows on the profile's tmux server, or one project's. */
    windows: (project?: string) => ctx.tmux.listWindows(project),
  };
}
