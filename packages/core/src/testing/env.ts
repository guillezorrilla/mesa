import { envRunner } from '../lib/process.js';

/** What the tests' real git leaves out: the user's and the system's config (signing, hooks). */
export const gitConfigOff = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

/**
 * The environment the tests' real git and tmux run in, in place of the host's: a fixed PATH and
 * no git config, so nothing a hook or the user exported reaches them.
 */
export const testEnv = { PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin', ...gitConfigOff };

/** The real runner over testEnv. */
export const testRunner = envRunner(testEnv);
