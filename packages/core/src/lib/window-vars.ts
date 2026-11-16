// The variables a Mesa window's environment holds, MESA_SESSION_ID and MESA_PROFILE: the one place
// that names them. Sessions set and read them (sessions/window/caller.ts); an agent's hooks and its
// mesa commands read them too (agents/hooks.ts).

/** The variable naming a window's Mesa session; a Claude Code hook reads it too. */
export const SESSION_ID_VAR = 'MESA_SESSION_ID';
/** The variable naming a window's profile. */
export const PROFILE_VAR = 'MESA_PROFILE';

/** The variables a window sets. */
export const WINDOW_VARS = [SESSION_ID_VAR, PROFILE_VAR] as const;
