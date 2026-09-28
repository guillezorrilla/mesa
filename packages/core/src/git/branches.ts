import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { findProject } from '../projects/projects.js';
import { checkoutHolder } from '../sessions/holders.js';
import type { SessionStore } from '../sessions/store.js';
import { type Checkout, gitWorktrees, resolveCheckout } from './checkout.js';
import { gitCommand } from './command.js';
import { branchName, commitOid } from './ref.js';

export type GitBranch = {
  name: string;
  oid: string;
  upstream?: string;
  checkedOutAt?: string;
  current: boolean;
};
export type GitBranchAction = {
  checkout: Checkout;
  name: string;
  action: 'create' | 'checkout' | 'delete';
};

export async function listGitBranches(
  profile: Profile,
  run: Runner,
  project: string,
  selected?: string,
): Promise<{ checkout: Checkout; branches: GitBranch[] }> {
  const checkout = await resolveCheckout(profile, run, project, selected);
  const root = findProject(profile, project).path;
  const [refs, worktrees, current] = await Promise.all([
    gitCommand(run, checkout.path, [
      'for-each-ref',
      '--format=%(refname:short)%00%(objectname)%00%(upstream:short)',
      'refs/heads/',
    ]),
    gitWorktrees(run, root),
    gitCommand(run, checkout.path, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
  ]);
  if (!refs.ok) throw new MesaError('usage', `cannot list branches: ${refs.detail}`);
  const byBranch = new Map(
    worktrees.filter((row) => row.branch).map((row) => [row.branch, row.path]),
  );
  const branches = refs.stdout
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name = '', oid = '', upstream = ''] = line.split('\0');
      return {
        name,
        oid,
        ...(upstream ? { upstream } : {}),
        ...(byBranch.has(name) ? { checkedOutAt: byBranch.get(name) } : {}),
        current: current.ok && current.stdout.trim() === name,
      };
    });
  return { checkout, branches };
}

export async function changeGitBranch(
  profile: Profile,
  run: Runner,
  store: SessionStore,
  project: string,
  selected: string | undefined,
  name: string,
  action: GitBranchAction['action'],
  base?: string,
): Promise<GitBranchAction> {
  const checkout = await resolveCheckout(profile, run, project, selected);
  await branchName(run, checkout.path, name);
  let args: string[];
  if (action === 'create') {
    const oid = await commitOid(run, checkout.path, base ?? 'HEAD');
    args = ['branch', '--no-track', '--', name, oid];
  } else if (action === 'checkout') {
    const root = findProject(profile, project).path;
    const holder = checkoutHolder(store, project, root, checkout.path);
    if (holder)
      throw new MesaError(
        'usage',
        `session ${holder.id} still uses ${checkout.path}; stop it before switching branches`,
      );
    args = ['switch', '--', name];
  } else {
    args = ['branch', '-d', '--', name];
  }
  const changed = await gitCommand(run, checkout.path, args, 30_000);
  if (!changed.ok)
    throw new MesaError('usage', `cannot ${action} branch ${name}: ${changed.detail}`);
  return { checkout, name, action };
}
