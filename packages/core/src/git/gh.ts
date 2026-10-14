import { type CliState, cliState } from '../lib/cli-state.js';
import type { Runner } from '../lib/process.js';

/** Whether `gh` can read pull requests on this machine: found, and logged in. */
export type GhState = CliState;

/** `gh --version`: the probe every gh reader starts with. */
export const ghVersion = (run: Runner) => run('gh', ['--version'], 5_000);

/** gh's state: its version, then `gh auth status`, which exits nonzero when no account is logged in. */
export const ghState = (run: Runner): Promise<GhState> => cliState(run, 'gh', ['auth', 'status']);
