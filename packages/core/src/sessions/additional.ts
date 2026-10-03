import type { Runner } from '../lib/process.js';
import { MesaError, toFail } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { findProject } from '../projects/projects.js';
import type { RegistryEntry } from '../projects/registry.js';
import { sessionWorktree } from '../worktrees/create.js';
import { worktreeRoot } from '../worktrees/location.js';
import { worktreeScript } from '../worktrees/settings.js';
import type { SessionRecord } from './record.js';
import type { SessionStore } from './store.js';
import { removeWorktree, requireGitTop, type Worktree, worktreePath } from './worktree.js';

// A session's additional projects (CONTEXT.md, Additional project; ADR-0021): the other projects
// it works in, each in its own worktree on the session's branch, which its agent is given as
// extra folders. The session's own project stays its primary.

export type Additional = NonNullable<SessionRecord['additional']>[number];

/** The folders a session's agent works in besides its own: each additional project's worktree. */
export const additionalDirs = (r: Pick<SessionRecord, 'additional'>) =>
  (r.additional ?? []).map((a) => a.worktree.path);

/**
 * The projects `mesa open --with` names, checked before any git write: each another project than
 * `primary`, named once, and registered (not_found), with its worktree setup approved
 * (needs_approval) and its folder the top of a git repository.
 */
export async function additionalProjects(
  deps: { profile: Profile; run: Runner },
  primary: RegistryEntry,
  names: readonly string[],
): Promise<RegistryEntry[]> {
  const entries: RegistryEntry[] = [];
  for (const name of names) {
    if (name === primary.name)
      throw new MesaError('usage', `${name} is the session's own project: drop --with ${name}`);
    if (entries.some((entry) => entry.name === name))
      throw new MesaError('usage', `--with ${name} is given twice`);
    entries.push(findProject(deps.profile, name));
  }
  for (const entry of entries) {
    worktreeScript(deps.profile, entry, 'setup');
    await requireGitTop(deps.run, entry.path);
  }
  return entries;
}

/**
 * Each additional project's worktree on `branch` as it will be, before any exists: for the
 * command-length check.
 */
export const plannedAdditional = (
  profile: Profile,
  entries: readonly RegistryEntry[],
  branch: string,
): Additional[] =>
  entries.map((entry) => ({
    project: entry.name,
    worktree: { path: worktreePath(worktreeRoot(profile, entry), branch), branch },
  }));

/**
 * The worktrees one launch made, to undo it when it fails: each removed with a branch it made,
 * unless its setup ran, which may have written user data; those stay, named in the error.
 */
export function launchWorktrees(run: Runner) {
  const made: { repo: string; worktree: Worktree }[] = [];
  const kept: string[] = [];
  return {
    /** One sessionWorktree selected for `entry`: noted when it made it. */
    add(
      profile: Profile,
      entry: RegistryEntry,
      selected: { worktree: Worktree; created: boolean },
    ) {
      if (!selected.created) return;
      if (worktreeScript(profile, entry, 'setup').length) kept.push(selected.worktree.path);
      else made.push({ repo: entry.path, worktree: selected.worktree });
    },
    /** Removes what it made, newest first; whether there was any. */
    async undo() {
      for (const { repo, worktree } of [...made].reverse())
        await removeWorktree(run, repo, worktree);
      return made.length > 0;
    },
    /** `error`, naming the worktrees kept. */
    named(error: unknown) {
      if (!kept.length) return error;
      const { code, message } = toFail(error).error;
      return new MesaError(code, `${message}; kept ${kept.join(', ')}, where setup ran`);
    },
  };
}

/**
 * Makes each additional project's worktree in order on the session's branch, from `base` if new
 * (sessionWorktree: an unheld one there is taken as it is), each written to the record and noted
 * in `made` as it is made.
 */
export async function createAdditional(
  deps: { profile: Profile; run: Runner; store: SessionStore },
  record: SessionRecord,
  entries: readonly RegistryEntry[],
  base: string | undefined,
  made: ReturnType<typeof launchWorktrees>,
): Promise<SessionRecord> {
  const branch = record.worktree?.branch;
  if (branch === undefined)
    throw new MesaError('internal', 'additional projects need the session worktree first');
  let current = record;
  for (const entry of entries) {
    const selected = await sessionWorktree(deps.profile, deps.run, deps.store, entry, branch, base);
    made.add(deps.profile, entry, selected);
    const added = { project: entry.name, worktree: selected.worktree };
    current = deps.store.update(current.id, (r) => ({
      additional: [...(r.additional ?? []), added],
    }));
  }
  return current;
}
