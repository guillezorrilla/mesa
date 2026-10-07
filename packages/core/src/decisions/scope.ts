import type { MesaContext } from '../context.js';
import { PROFILE_VAR, SESSION_ID_VAR } from '../lib/window-vars.js';
import { windowId } from '../sessions/window/caller.js';
import { type VaultBinding, vaultBinding } from '../vault/mount/binding.js';

// Whose context a decision call may use (CONTEXT.md, Scoped context): one live session of this
// profile, by the vault server's binding rule (ADR-0011), so a stopped, removed, foreign or
// unreadable session is refused, and a session never reaches another's context.

/**
 * The session a decision call serves, or why none. Inside a Mesa window it is the Caller, and
 * naming another session is refused; outside one a person names the session (`given`). Asked
 * again on every request.
 */
export function decisionBinding(
  ctx: Pick<MesaContext, 'store' | 'env' | 'profile'>,
  given?: string,
): VaultBinding {
  const caller = windowId(ctx.env);
  if (caller && given && given !== caller)
    return { refused: `session ${caller} uses only its own context, not session ${given}'s` };
  if (!caller && !given) return { refused: 'not in a Mesa session: name one with --session <id>' };
  const env = caller
    ? ctx.env
    : { ...ctx.env, [SESSION_ID_VAR]: given, [PROFILE_VAR]: ctx.profile };
  try {
    return vaultBinding({ ...ctx, env });
  } catch (error) {
    return {
      refused: `session binding failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
