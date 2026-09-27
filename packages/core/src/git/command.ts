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
