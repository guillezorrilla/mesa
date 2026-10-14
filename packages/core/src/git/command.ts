import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';

/** Git through Mesa's injected runner. Failed Git commands remain results for each caller to explain. */
export async function gitCommand(
  run: Runner,
  cwd: string,
  args: string[],
  timeoutMs = 5_000,
  missingMessage = 'git not found on PATH',
) {
  const result = await run('git', ['-C', cwd, ...args], timeoutMs);
  if (result.ok || result.reason === 'failed') return result;
  throw new MesaError(
    'internal',
    result.reason === 'missing'
      ? missingMessage
      : `git did not answer within ${timeoutMs / 1000} s`,
  );
}

/** A git call that must succeed: its stdout, or its failure as a usage error, `why` then git's reason. */
export async function mustGit(
  run: Runner,
  cwd: string,
  args: string[],
  why: string,
  timeoutMs = 60_000,
  missingMessage?: string,
) {
  const result = await gitCommand(run, cwd, args, timeoutMs, missingMessage);
  if (!result.ok) throw new MesaError('usage', `${why}: ${result.detail}`);
  return result.stdout;
}
