import type { MesaContext } from '../context.js';
import { callerOf, SESSION_ID_VAR, windowId } from '../sessions/caller.js';
import type { SessionRecord } from '../sessions/record.js';

// The vault server's binding (ADR-0011, CONTEXT.md Vault server): the one Mesa session a
// `mesa vault mcp` process serves, from the MESA_SESSION_ID and MESA_PROFILE its agent passed on.

/** The live session the server serves, or why it serves none. */
export type VaultBinding = { session: SessionRecord } | { refused: string };

/**
 * The session in this process's environment, when this profile has it and it has not ended; read
 * again on every request, so a session stopped while its server runs is refused from then on.
 */
export function vaultBinding(ctx: Pick<MesaContext, 'store' | 'deps' | 'profile'>): VaultBinding {
  const { env } = ctx.deps;
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
  if (session.endedAt) return { refused: `session ${id} ended at ${session.endedAt}` };
  return { session };
}
