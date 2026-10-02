import { NESTED_STATUS_LINE_VAR, userStatusLineCommand } from '../agents/claude/statusline.js';
import type { MesaContext } from '../context.js';
import { callerOf } from '../sessions/caller.js';
import { sessionCost } from './session-cost.js';

/** How long the user's own status line may run before Mesa shows its cost alone. */
const USER_LINE_TIMEOUT_MS = 5_000;

/** What `mesa statusline` prints, and what it is made of. */
export type StatusLine = {
  line: string;
  /** What the user's own statusLine command printed; null with none, or when it failed. */
  user: string | null;
  /** The calling Mesa session, and its estimated cost; null outside one, or when unknown. */
  session: string | null;
  estimatedCostUsd: number | null;
};

/** The user's line with the cost at its end (on its last line), else the cost alone. */
export const statusLineText = (user: string | null, costUsd: number | null) => {
  const cost = costUsd === null ? '' : `$${costUsd.toFixed(2)} est.`;
  return [user, cost].filter(Boolean).join(' · ');
};

/**
 * The status line Mesa gives Claude in its sessions (sessions.statusLineCost): the user's own
 * statusLine command run with the same stdin, then the calling session's estimated cost
 * (session-cost.ts). It never throws: what fails is left out, so the user's line still shows.
 * Under the user's command (NESTED_STATUS_LINE_VAR), it prints nothing.
 */
export function statusLineService(ctx: MesaContext) {
  const { deps } = ctx;
  const userLine = async (payload: string) => {
    let project = deps.cwd;
    try {
      const input = JSON.parse(payload) as { cwd?: unknown; workspace?: { project_dir?: unknown } };
      const dir = input.workspace?.project_dir ?? input.cwd;
      if (typeof dir === 'string' && dir) project = dir;
    } catch {
      // The user's command still gets the payload as it came.
    }
    const command = userStatusLineCommand(deps.home, deps.env, project, deps.self);
    if (!command) return null;
    const result = await deps.run('/bin/sh', ['-c', command], USER_LINE_TIMEOUT_MS, {
      cwd: deps.cwd,
      env: { ...deps.env, [NESTED_STATUS_LINE_VAR]: '1' },
      input: payload,
    });
    return result.ok ? result.stdout.replace(/\n+$/, '') : null;
  };
  const callerCost = async () => {
    const session = callerOf({ store: ctx.store, env: deps.env, profileName: ctx.profile }).session;
    if (!session) return { session: null, estimatedCostUsd: null };
    try {
      return { session: session.id, estimatedCostUsd: sessionCost(ctx, session.id) };
    } catch {
      return { session: session.id, estimatedCostUsd: null };
    }
  };
  return {
    line: async (payload: string): Promise<StatusLine> => {
      if (deps.env[NESTED_STATUS_LINE_VAR])
        return { line: '', user: null, session: null, estimatedCostUsd: null };
      const [user, cost] = await Promise.all([
        userLine(payload).catch(() => null),
        callerCost().catch(() => ({ session: null, estimatedCostUsd: null })),
      ]);
      return { line: statusLineText(user, cost.estimatedCostUsd), user, ...cost };
    },
  };
}
