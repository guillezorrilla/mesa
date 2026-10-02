import type { Runner } from '../lib/process.js';

/**
 * Whether `gh` can read pull requests on this machine: found, and logged in. A reported state,
 * never a thrown error, so a missing or logged-out `gh` invents no pull request facts.
 */
export type GhState =
  | { state: 'ready'; version: string }
  | { state: 'missing' }
  | { state: 'unauthenticated'; version: string }
  | { state: 'unavailable'; reason: 'failed' | 'timeout' };

/** `gh --version`: the probe every gh reader starts with. */
export const ghVersion = (run: Runner) => run('gh', ['--version'], 5_000);

/** gh's state: its version, then `gh auth status`, which exits nonzero when no account is logged in. */
export async function ghState(run: Runner): Promise<GhState> {
  const version = await ghVersion(run);
  if (!version.ok)
    return version.reason === 'missing'
      ? { state: 'missing' }
      : { state: 'unavailable', reason: version.reason };
  const line = version.stdout.split('\n')[0] ?? '';
  const auth = await run('gh', ['auth', 'status'], 10_000);
  if (auth.ok) return { state: 'ready', version: line };
  if (auth.reason === 'timeout') return { state: 'unavailable', reason: 'timeout' };
  return { state: 'unauthenticated', version: line };
}
