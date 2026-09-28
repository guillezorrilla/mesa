import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import { gitCommand } from './command.js';

/** Resolve a user ref to a commit OID before passing it to another Git operation. */
export async function commitOid(run: Runner, cwd: string, ref: string): Promise<string> {
  if (!ref || ref.includes('\0')) throw new MesaError('usage', 'commit ref is required');
  const result = await gitCommand(run, cwd, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${ref}^{commit}`,
  ]);
  if (!result.ok) throw new MesaError('usage', `invalid commit ref ${ref}: ${result.detail}`);
  return result.stdout.trim();
}

/** Git validates branch syntax; Mesa refuses checkout shorthand that resolves to another name. */
export async function branchName(run: Runner, cwd: string, name: string): Promise<string> {
  if (!name || name.includes('\0')) throw new MesaError('usage', 'branch name is required');
  const checked = await gitCommand(run, cwd, ['check-ref-format', '--branch', name]);
  if (!checked.ok || checked.stdout.trim() !== name) {
    throw new MesaError('usage', `${name} is not a valid branch name`);
  }
  return name;
}
