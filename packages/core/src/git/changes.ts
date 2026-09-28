import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { type Checkout, resolveCheckout } from './checkout.js';
import { gitCommand } from './command.js';
import { literalPath } from './path.js';

export type GitPathAction = { checkout: Checkout; path: string; action: 'stage' | 'unstage' };
export type GitCommit = { checkout: Checkout; oid: string; summary: string };

/** Change only the named literal path in the index. */
export async function changeGitIndex(
  profile: Profile,
  run: Runner,
  project: string,
  selected: string | undefined,
  path: string,
  action: 'stage' | 'unstage',
): Promise<GitPathAction> {
  const spec = literalPath(path);
  const checkout = await resolveCheckout(profile, run, project, selected);
  let args = ['add', '-A', '--', spec];
  if (action === 'unstage') {
    const head = await gitCommand(run, checkout.path, ['rev-parse', '--verify', 'HEAD']);
    args = head.ok ? ['restore', '--staged', '--', spec] : ['rm', '--cached', '-f', '--', spec];
  }
  const result = await gitCommand(run, checkout.path, args, 15_000);
  if (!result.ok) throw new MesaError('usage', `cannot ${action} ${path}: ${result.detail}`);
  return { checkout, path, action };
}

/** Commit exactly the current index; no implicit add. */
export async function commitGit(
  profile: Profile,
  run: Runner,
  project: string,
  selected: string | undefined,
  message: string,
): Promise<GitCommit> {
  if (!message.trim() || message.includes('\0')) {
    throw new MesaError('usage', 'commit message must be nonempty and contain no NUL');
  }
  const checkout = await resolveCheckout(profile, run, project, selected);
  const committed = await gitCommand(run, checkout.path, ['commit', '-m', message], 60_000);
  if (!committed.ok) throw new MesaError('usage', `cannot commit: ${committed.detail}`);
  const oid = await gitCommand(run, checkout.path, ['rev-parse', 'HEAD']);
  if (!oid.ok)
    throw new MesaError('internal', `commit succeeded but HEAD is unreadable: ${oid.detail}`);
  return { checkout, oid: oid.stdout.trim(), summary: message.split('\n', 1)[0] ?? '' };
}
