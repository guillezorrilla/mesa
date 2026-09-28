import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { type Checkout, resolveCheckout } from './checkout.js';
import { gitCommand } from './command.js';

export type StashEntry = { ref: string; oid: string; message: string };
export type StashCreated = { checkout: Checkout; created: boolean; oid?: string };
export type StashAction = {
  checkout: Checkout;
  ref: string;
  oid: string;
  action: 'apply' | 'pop' | 'drop';
};

async function stashOid(run: Runner, cwd: string, ref: string): Promise<string> {
  if (!/^stash@\{\d+\}$/.test(ref))
    throw new MesaError('usage', 'select a stash ref from git stash list');
  const resolved = await gitCommand(run, cwd, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${ref}^{commit}`,
  ]);
  if (!resolved.ok) throw new MesaError('not_found', `stash ${ref} is unavailable`);
  return resolved.stdout.trim();
}

async function topStash(run: Runner, cwd: string): Promise<string | undefined> {
  const result = await gitCommand(run, cwd, ['rev-parse', '--verify', '--quiet', 'refs/stash']);
  return result.ok ? result.stdout.trim() : undefined;
}

export async function listGitStashes(
  profile: Profile,
  run: Runner,
  project: string,
  selected?: string,
): Promise<{ checkout: Checkout; stashes: StashEntry[] }> {
  const checkout = await resolveCheckout(profile, run, project, selected);
  const result = await gitCommand(run, checkout.path, [
    'stash',
    'list',
    '--format=%gd%x00%H%x00%gs',
  ]);
  if (!result.ok) throw new MesaError('usage', `cannot list stashes: ${result.detail}`);
  const stashes = result.stdout
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [ref = '', oid = '', message = ''] = line.split('\0');
      return { ref, oid, message };
    });
  return { checkout, stashes };
}

/** Include untracked files but never ignored files; report a clean no-op as such. */
export async function createGitStash(
  profile: Profile,
  run: Runner,
  project: string,
  selected?: string,
  message?: string,
): Promise<StashCreated> {
  if (message?.includes('\0')) throw new MesaError('usage', 'stash message cannot contain NUL');
  const checkout = await resolveCheckout(profile, run, project, selected);
  const before = await topStash(run, checkout.path);
  const result = await gitCommand(
    run,
    checkout.path,
    ['stash', 'push', '-u', ...(message?.trim() ? ['-m', message] : [])],
    60_000,
  );
  if (!result.ok) throw new MesaError('usage', `cannot stash changes: ${result.detail}`);
  const after = await topStash(run, checkout.path);
  if (after === before) return { checkout, created: false };
  if (!after) throw new MesaError('internal', 'stash reported success but its ref is missing');
  return { checkout, created: true, oid: after };
}

/** Apply by OID, then recheck the ref before any drop, so a conflict keeps the stash. */
export async function changeGitStash(
  profile: Profile,
  run: Runner,
  project: string,
  selected: string | undefined,
  ref: string,
  action: StashAction['action'],
): Promise<StashAction> {
  const checkout = await resolveCheckout(profile, run, project, selected);
  const oid = await stashOid(run, checkout.path, ref);
  if (action !== 'drop') {
    const applied = await gitCommand(run, checkout.path, ['stash', 'apply', oid], 60_000);
    if (!applied.ok)
      throw new MesaError(
        'usage',
        `stash ${ref} could not be applied; it remains saved and the checkout may contain partial changes or conflicts: ${applied.detail}`,
      );
  }
  if (action !== 'apply') {
    if ((await stashOid(run, checkout.path, ref)) !== oid) {
      throw new MesaError(
        'usage',
        `stash ${ref} moved; ${action === 'pop' ? 'changes were applied, but the stash was kept' : 'nothing was dropped'}`,
      );
    }
    const dropped = await gitCommand(run, checkout.path, ['stash', 'drop', ref]);
    if (!dropped.ok)
      throw new MesaError(
        'usage',
        `stash ${ref} ${action === 'pop' ? 'was applied but not dropped' : 'was not dropped'}: ${dropped.detail}`,
      );
  }
  return { checkout, ref, oid, action };
}
