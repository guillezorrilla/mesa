import type { Override } from '../decisions/guardrail.js';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { type Checkout, resolveCheckout } from './checkout.js';
import { gitCommand } from './command.js';
import { branchName } from './ref.js';

export type GitTracking = { checkout: Checkout; branch: string; remote: string; upstream: string };
export type GitSync = GitTracking & {
  action: 'push' | 'pull';
  before: string;
  after: string;
  output: string;
  override?: Override;
};

/** Resolve the current branch's configured upstream; sync never guesses a remote or destination. */
export async function gitTracking(
  profile: Profile,
  run: Runner,
  project: string,
  selected?: string,
): Promise<GitTracking> {
  const checkout = await resolveCheckout(profile, run, project, selected);
  const current = await gitCommand(run, checkout.path, [
    'symbolic-ref',
    '--quiet',
    '--short',
    'HEAD',
  ]);
  if (!current.ok) throw new MesaError('usage', 'select a branch before pushing or pulling');
  const branch = await branchName(run, checkout.path, current.stdout.trim());
  const [remoteResult, mergeResult, remotes] = await Promise.all([
    gitCommand(run, checkout.path, ['config', '--get', `branch.${branch}.remote`]),
    gitCommand(run, checkout.path, ['config', '--get', `branch.${branch}.merge`]),
    gitCommand(run, checkout.path, ['remote']),
  ]);
  const remote = remoteResult.ok ? remoteResult.stdout.trim() : '';
  const merge = mergeResult.ok ? mergeResult.stdout.trim() : '';
  if (
    !remote ||
    remote === '.' ||
    !remotes.ok ||
    !remotes.stdout.split('\n').includes(remote) ||
    !merge.startsWith('refs/heads/')
  ) {
    throw new MesaError(
      'usage',
      `branch ${branch} has no supported remote upstream; set its upstream in Git first`,
    );
  }
  const upstream = await branchName(run, checkout.path, merge.slice('refs/heads/'.length));
  return { checkout, branch, remote, upstream };
}

/** Push exactly HEAD to its configured upstream, or pull only a fast-forward into a clean checkout. */
export async function syncGit(
  run: Runner,
  target: GitTracking,
  action: GitSync['action'],
): Promise<GitSync> {
  const cwd = target.checkout.path;
  const head = await gitCommand(run, cwd, ['rev-parse', '--verify', 'HEAD']);
  if (!head.ok) throw new MesaError('usage', `cannot ${action} without a commit`);
  if (action === 'pull') {
    const status = await gitCommand(run, cwd, ['status', '--porcelain=v1', '-z']);
    if (!status.ok)
      throw new MesaError('usage', `cannot check the checkout before pull: ${status.detail}`);
    if (status.stdout)
      throw new MesaError('usage', 'commit or stash checkout changes before pulling');
  }
  const args =
    action === 'push'
      ? ['push', '--porcelain', target.remote, `HEAD:refs/heads/${target.upstream}`]
      : ['pull', '--ff-only', target.remote, target.upstream];
  const result = await gitCommand(run, cwd, args, 120_000);
  if (!result.ok)
    throw new MesaError(
      'usage',
      `cannot ${action} ${target.remote}/${target.upstream}: ${result.detail}`,
    );
  const updated =
    action === 'pull' ? await gitCommand(run, cwd, ['rev-parse', '--verify', 'HEAD']) : head;
  if (!updated.ok) throw new MesaError('internal', `${action} succeeded but HEAD is unreadable`);
  return {
    ...target,
    action,
    before: head.stdout.trim(),
    after: updated.stdout.trim(),
    output: result.stdout.trim(),
  };
}
