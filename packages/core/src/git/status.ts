import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { type Checkout, resolveCheckout } from './checkout.js';
import { gitCommand } from './command.js';

export type GitChange = {
  path: string;
  oldPath?: string;
  index: string;
  workingTree: string;
};
export type GitStatus = { checkout: Checkout; branch: string | null; changes: GitChange[] };

/** Porcelain v1 with NUL paths keeps spaces, newlines and rename sources literal. */
function changesOf(output: string): GitChange[] {
  const fields = output.split('\0');
  const changes: GitChange[] = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (!field) continue;
    const index = field[0] ?? ' ';
    const workingTree = field[1] ?? ' ';
    const path = field.slice(3);
    const renamed = index === 'R' || index === 'C' || workingTree === 'R' || workingTree === 'C';
    const oldPath = renamed ? fields[++i] : undefined;
    changes.push({ path, index, workingTree, ...(oldPath === undefined ? {} : { oldPath }) });
  }
  return changes;
}

export async function readGitStatus(
  profile: Profile,
  run: Runner,
  project: string,
  selected?: string,
): Promise<GitStatus> {
  const checkout = await resolveCheckout(profile, run, project, selected);
  const [branch, status] = await Promise.all([
    gitCommand(run, checkout.path, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
    gitCommand(run, checkout.path, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
  ]);
  if (!status.ok) throw new MesaError('usage', `cannot read Git status: ${status.detail}`);
  return {
    checkout,
    branch: branch.ok ? branch.stdout.trim() : null,
    changes: changesOf(status.stdout),
  };
}
