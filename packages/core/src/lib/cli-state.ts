import type { Runner } from './process.js';

/**
 * Whether a signed-in CLI (gh, twg) can act on this machine: found, and logged in. A reported
 * state, never a thrown error, so a missing or logged-out CLI invents no facts.
 */
export type CliState =
  | { state: 'ready'; version: string }
  | { state: 'missing' }
  | { state: 'unauthenticated'; version: string }
  | { state: 'unavailable'; reason: 'failed' | 'timeout' };

/** The CLI's state: `<cli> --version`, then `authArgs`, which exits nonzero when no account is logged in. */
export async function cliState(run: Runner, cli: string, authArgs: string[]): Promise<CliState> {
  // Both at once; a missing CLI answers neither, and its version says so.
  const [version, auth] = await Promise.all([
    run(cli, ['--version'], 5_000),
    run(cli, authArgs, 10_000),
  ]);
  if (!version.ok)
    return version.reason === 'missing'
      ? { state: 'missing' }
      : { state: 'unavailable', reason: version.reason };
  const line = version.stdout.split('\n')[0] ?? '';
  if (auth.ok) return { state: 'ready', version: line };
  if (auth.reason === 'timeout') return { state: 'unavailable', reason: 'timeout' };
  return { state: 'unauthenticated', version: line };
}
