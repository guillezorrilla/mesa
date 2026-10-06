import type { MesaContext } from '../../context.js';
import { SESSION_ID_VAR } from '../../lib/window-vars.js';
import { callerOf, windowId } from '../../sessions/caller.js';
import { resumerOf } from '../../sessions/holders.js';
import type { SessionRecord } from '../../sessions/record.js';
import type { SessionStore } from '../../sessions/store.js';

// The vault server's binding (ADR-0011, CONTEXT.md Vault server): the one Mesa session a
// `mesa vault mcp` process serves, from the MESA_SESSION_ID and MESA_PROFILE its agent passed on.

/** The live session the server serves, or why it serves none. */
export type VaultBinding = { session: SessionRecord } | { refused: string };

/**
 * The session in this process's environment, when this profile has it and it has not ended; read
 * again on every request, so a session stopped while its server runs is refused from then on.
 */
export function vaultBinding(ctx: Pick<MesaContext, 'store' | 'env' | 'profile'>): VaultBinding {
  const { env } = ctx;
  const id = windowId(env);
  if (!id) return { refused: `${SESSION_ID_VAR} is not set: this is not a Mesa session` };
  const { session } = callerOf({ store: ctx.store, env, profileName: ctx.profile });
  if (!session) {
    const other = env.MESA_PROFILE && env.MESA_PROFILE !== ctx.profile;
    return {
      refused: other
        ? `session ${id} is profile ${env.MESA_PROFILE}'s, not ${ctx.profile}'s`
        : `profile ${ctx.profile} has no session ${id}: it is unknown or was removed`,
    };
  }
  const served = session.background && session.endedAt ? lastResume(ctx.store, session) : session;
  if (served.endedAt) return { refused: `session ${served.id} ended at ${served.endedAt}` };
  return { session: served };
}

/**
 * A background Claude process keeps the binding it was started with (agents/claude/background.ts),
 * also once a Mesa resume attaches to it under a new record: the last record resuming it.
 */
function lastResume(store: SessionStore, record: SessionRecord): SessionRecord {
  const next = resumerOf(store, record);
  const resumed = next ? store.find(next) : undefined;
  return resumed ? lastResume(store, resumed) : record;
}
