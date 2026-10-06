import type { Env } from '../lib/process.js';
import { PROFILE_VAR, SESSION_ID_VAR } from '../lib/window-vars.js';
import type { SessionRecord } from './record.js';
import type { SessionStore } from './store.js';

// Whether mesa runs inside a Mesa window, and whose: the MESA_SESSION_ID and MESA_PROFILE a
// window's environment holds (lib/window-vars.ts). The one place that writes and reads them.

/** The environment a session's window gets, so mesa inside it knows the session and profile. */
export const windowEnv = (id: string, profileName: string) => ({
  [SESSION_ID_VAR]: id,
  [PROFILE_VAR]: profileName,
});

/** The Mesa session id a window's environment names, if any, of whatever profile. */
export const windowId = (env: Env) => env[SESSION_ID_VAR] || undefined;

/** Who runs this mesa: this profile's session whose window it is in, and whether it is in any. */
export type Caller = { session?: SessionRecord; inMesaWindow: boolean };

/**
 * The caller from a window's environment. A window of another profile (MESA_PROFILE names it),
 * or of a removed session, is in a Mesa window with no session here.
 */
export function callerOf(deps: { store: SessionStore; env: Env; profileName: string }): Caller {
  const id = windowId(deps.env);
  const windowProfile = deps.env.MESA_PROFILE ?? deps.profileName;
  const session = id && windowProfile === deps.profileName ? deps.store.find(id) : undefined;
  return { inMesaWindow: id !== undefined, ...(session ? { session } : {}) };
}
