// The variables a Mesa window's environment holds, MESA_SESSION_ID and MESA_PROFILE: the one place
// that names them. Sessions set and read them (sessions/window/caller.ts); an agent's hooks and its
// mesa-vault server read them too (agents/hooks.ts, agents/vault-mount.ts).

/** The variable naming a window's Mesa session; a Claude Code hook reads it too. */
export const SESSION_ID_VAR = 'MESA_SESSION_ID';
/** The variable naming a window's profile. */
export const PROFILE_VAR = 'MESA_PROFILE';

/** The variables a window sets, which Codex passes on to the mesa-vault server only when named. */
export const WINDOW_VARS = [SESSION_ID_VAR, PROFILE_VAR] as const;
