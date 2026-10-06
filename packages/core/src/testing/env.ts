import { envRunner } from '../lib/process.js';

/**
 * The environment the tests' real git and tmux run in, in place of the host's: a fixed PATH and
 * no user or system git config (signing, hooks), so nothing a hook or the user exported reaches
 * them. A test's own git calls pass it too.
 */
export const testEnv = {
  PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

/** The real runner over testEnv. */
export const testRunner = envRunner(testEnv);
