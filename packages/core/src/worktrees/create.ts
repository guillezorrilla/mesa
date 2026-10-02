import { cpSync, lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { createCheckedFilePath } from '../files/path.js';
import { gitWorktrees, resolveCheckout } from '../git/checkout.js';
import { gitCommand } from '../git/command.js';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import type { RegistryEntry } from '../projects/registry.js';
import { worktreeHolder } from '../sessions/holders.js';
import type { SessionStore } from '../sessions/store.js';
import { addWorktree, removeWorktree, worktreePath } from '../sessions/worktree.js';
import { ignoreNestedWorktrees, worktreeRoot } from './location.js';
import { worktreeSettings } from './settings.js';

/** A session may take an existing unheld worktree at its configured branch path. */
export async function sessionWorktree(
  profile: Profile,
  run: Runner,
  store: SessionStore,
  project: RegistryEntry,
  branch: string,
  base?: string,
) {
  const path = worktreePath(worktreeRoot(profile, project), branch);
  const present = lstatSync(path, { throwIfNoEntry: false });
  if (!present)
    return {
      worktree: await createWorktree(profile, run, store, project, branch, base),
      created: true,
    };
  const taken = () =>
    new MesaError('usage', `${path} already exists: pick another branch, or remove it`);
  if (present.isSymbolicLink() || !present.isDirectory()) throw taken();
  const holder = worktreeHolder(store, path);
  if (holder?.worktree)
    throw new MesaError(
      'usage',
      `session ${holder.id} has ${holder.worktree.branch}'s worktree at ${path}: use that session, or pick another branch`,
    );
  if (base) throw new MesaError('usage', 'an existing worktree keeps its branch; drop --base');
  let canonical: string;
  try {
    canonical = realpathSync.native(path);
  } catch {
    throw taken();
  }
  const linked = (await gitWorktrees(run, project.path)).find((entry) => entry.path === canonical);
  if (!linked) throw taken();
  if (linked.branch !== branch)
    throw new MesaError('usage', `${path} is not ${branch}'s linked worktree`);
  const checkout = await resolveCheckout(profile, run, project.name, path);
  return { worktree: { path: checkout.path, branch }, created: false };
}

/**
 * Manual and session worktrees take one policy, the profile's under the project's overrides, with
 * explicit branch/base overrides.
 */
export async function createWorktree(
  profile: Profile,
  run: Runner,
  store: SessionStore,
  project: RegistryEntry,
  branch: string,
  base?: string,
) {
  const root = worktreeRoot(profile, project);
  const path = worktreePath(root, branch);
  const holder = worktreeHolder(store, path);
  if (holder?.worktree && lstatSync(path, { throwIfNoEntry: false })) {
    throw new MesaError(
      'usage',
      `session ${holder.id} has ${holder.worktree.branch}'s worktree at ${path}: use that session, or pick another branch`,
    );
  }
  const settings = worktreeSettings(profile, project.path);
  const worktree = await addWorktree(run, {
    repo: project.path,
    root,
    branch,
    base,
    defaultBase: settings.base,
    fetch: settings.fetch,
  });
  try {
    ignoreNestedWorktrees(profile, project);
    if (settings.sparseDirectories.length) {
      const sparse = await gitCommand(
        run,
        worktree.path,
        ['sparse-checkout', 'set', '--cone', '--', ...settings.sparseDirectories],
        60_000,
      );
      if (!sparse.ok) throw new MesaError('usage', `cannot set sparse checkout: ${sparse.detail}`);
    }
    for (const directory of settings.carryIgnoredDirectories) {
      await carryIgnoredDirectory(run, project.path, worktree.path, directory);
    }
  } catch (error) {
    try {
      await removeWorktree(run, project.path, worktree);
    } catch (cleanup) {
      throw new MesaError(
        'internal',
        `worktree creation failed and cleanup of ${worktree.path} failed: ${String(cleanup)}`,
      );
    }
    throw error;
  }
  // Setup may write user data. If it fails, leave the linked checkout for an explicit rerun.
  if (settings.setup.length) await worktreeCommand(run, worktree.path, settings.setup, 'setup');
  return worktree;
}

/** Run an explicitly configured command in a selected worktree, without a shell. */
export async function worktreeCommand(
  run: Runner,
  path: string,
  argv: string[],
  kind: 'setup' | 'teardown',
) {
  if (!argv.length) throw new MesaError('usage', `no worktree ${kind} command is configured`);
  const result = await run(argv[0] as string, argv.slice(1), 120_000, { cwd: path });
  if (!result.ok)
    throw new MesaError(
      'usage',
      `${kind} failed in ${path}: ${result.detail}; checkout ${lstatSync(path, { throwIfNoEntry: false }) ? 'remains' : 'is missing'}`,
    );
  return { path, ran: true as const };
}

async function carryIgnoredDirectory(
  run: Runner,
  repo: string,
  worktree: string,
  directory: string,
) {
  const source = join(repo, directory);
  const stat = lstatSync(source, { throwIfNoEntry: false });
  if (!stat?.isDirectory() || stat.isSymbolicLink())
    throw new MesaError('usage', `${directory} is not a local directory to carry`);
  const actual = realpathSync.native(source);
  const within = relative(realpathSync.native(repo), actual);
  if (
    !within ||
    within.startsWith('..') ||
    isAbsolute(within) ||
    realpathSync.native(worktree).startsWith(`${actual}/`)
  )
    throw new MesaError('usage', `${directory} is not safe to carry`);
  const ignored = await gitCommand(run, repo, ['check-ignore', '-q', '--', directory]);
  const tracked = await gitCommand(run, repo, ['ls-files', '--cached', '--', directory]);
  if (!ignored.ok || !tracked.ok || tracked.stdout.trim())
    throw new MesaError('usage', `${directory} must be ignored and untracked to carry`);
  const target = createCheckedFilePath(worktree, directory);
  // verbatimSymlinks: a relative link such as pnpm's node_modules/pkg -> ../packages/pkg stays
  // relative, so the worktree uses its own packages rather than the source checkout's.
  cpSync(source, target, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
    errorOnExist: true,
    force: false,
  });
}
