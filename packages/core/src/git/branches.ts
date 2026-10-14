import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { type Checkout, resolveCheckout } from '../projects/checkout.js';
import { findProject } from '../projects/projects.js';
import { checkoutHolder } from '../sessions/record/holders.js';
import type { SessionStore } from '../sessions/record/store.js';
import { gitWorktrees } from './checkout.js';
import { gitCommand } from './command.js';
import { branchName, commitOid, currentBranch } from './ref.js';

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
): Promise<{ checkout: Checkout; branches: GitBranch[]; remotes: string[] }> {
  const checkout = await resolveCheckout(profile, run, project, selected);
  const root = findProject(profile, project).path;
  const [refs, worktrees, current] = await Promise.all([
    gitCommand(run, checkout.path, [
      'for-each-ref',
      // The full refname: lstrip or :short would say heads/x when a tag x exists too.
      '--format=%(refname)%00%(objectname)%00%(upstream:short)',
      'refs/heads/',
      'refs/remotes/',
    ]),
    gitWorktrees(run, root),
    currentBranch(run, checkout.path),
  ]);
  if (!refs.ok) throw new MesaError('usage', `cannot list branches: ${refs.detail}`);
  const byBranch = new Map(
    worktrees.filter((row) => row.branch).map((row) => [row.branch, row.path]),
  );
  const rows = refs.stdout
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\0'));
  const branches = rows.flatMap(([ref = '', oid = '', upstream = '']) => {
    if (!ref.startsWith('refs/heads/')) return [];
    const name = ref.slice('refs/heads/'.length);
    return [
      {
        name,
        oid,
        ...(upstream ? { upstream } : {}),
        ...(byBranch.has(name) ? { checkedOutAt: byBranch.get(name) } : {}),
        current: current === name,
      },
    ];
  });
  // Each remote's branches, its HEAD alias left out: what a branch can be compared with.
  const remotes = rows.flatMap(([ref = '']) =>
    ref.startsWith('refs/remotes/') && !ref.endsWith('/HEAD')
      ? [ref.slice('refs/remotes/'.length)]
      : [],
  );
  return { checkout, branches, remotes };
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
