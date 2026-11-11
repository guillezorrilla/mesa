import type { AsyncLockDeps } from '../../lib/lock-file.js';
import type { Runner } from '../../lib/process.js';
import { MesaError, toFail } from '../../lib/result.js';
import type { Profile } from '../../profile/profile.js';
import { findProject, restoreProjectFile } from '../../projects/projects.js';
import type { RegistryEntry } from '../../projects/registry.js';
import { sessionWorktree } from '../../worktrees/create.js';
import { worktreeRoot } from '../../worktrees/location.js';
import { worktreeScript } from '../../worktrees/settings.js';
import type { SessionRecord } from '../record/record.js';
import type { SessionStore } from '../record/store.js';
import type { SetupBeside } from './setup-session.js';
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
 * `primary`, named once, and registered (not_found), its mesa.yaml restored when gone, with its
 * worktree setup approved
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
    restoreProjectFile(entry);
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
  const stuck: string[] = [];
  return {
    /**
     * One sessionWorktree selected for `entry`: noted when it made it, kept when its setup ran;
     * one whose setup it left to a Setup session (`setup`) is kept once that opens (keep).
     */
    add(
      profile: Profile,
      entry: RegistryEntry,
      selected: { worktree: Worktree; created: boolean; setup?: string[] },
    ) {
      if (!selected.created) return;
      if (!selected.setup && worktreeScript(profile, entry, 'setup').length)
        kept.push(selected.worktree.path);
      else made.push({ repo: entry.path, worktree: selected.worktree });
    },
    /** A worktree `add` noted, kept from now on: its setup has started in a Setup session. */
    keep(path: string) {
      const at = made.findIndex((m) => m.worktree.path === path);
      if (at >= 0) made.splice(at, 1);
      kept.push(path);
    },
    /**
     * Removes what it made, newest first, each on its own: one that cannot be removed is named in
     * the error (named) and the rest still go. The paths it removed; never throws.
     */
    async undo() {
      const removed: string[] = [];
      for (const { repo, worktree } of [...made].reverse()) {
        try {
          await removeWorktree(run, repo, worktree);
          removed.push(worktree.path);
        } catch {
          stuck.push(worktree.path);
        }
      }
      return removed;
    },
    /** `error`, naming the worktrees kept and those that could not be removed. */
    named(error: unknown) {
      if (!kept.length && !stuck.length) return error;
      const { code, message } = toFail(error).error;
      const left = [
        ...(kept.length ? [`kept ${kept.join(', ')}, where setup ran`] : []),
        ...(stuck.length ? [`could not remove ${stuck.join(', ')}`] : []),
      ];
      return new MesaError(code, [message, ...left].join('; '));
    },
  };
}

/**
 * Opens a Setup session (`setupWhile: parallel`) for the new worktree that `selected` in
 * `project` left its setup to, child of `owner`, the worktree kept in `made` once it opens: its
 * id. One that cannot open is a warning, and the agent still starts; the worktree waits for its
 * setup to be run by hand, and a launch that fails later removes it, as setup never ran.
 */
export async function openSetupBeside(
  setupBeside: SetupBeside,
  owner: SessionRecord,
  project: RegistryEntry,
  selected: { worktree: Worktree; setup: string[] },
  made: ReturnType<typeof launchWorktrees>,
  warnings: (string | undefined)[],
): Promise<string | undefined> {
  try {
    const id = await setupBeside(owner, selected.setup, project);
    made.keep(selected.worktree.path);
    return id;
  } catch (error) {
    warnings.push(
      `setup did not start: ${toFail(error).error.message}; run mesa worktrees rerun ${project.name} ${selected.worktree.path}`,
    );
    return undefined;
  }
}

/** An additional project a launch gives a worktree, and the ref its new branch starts from. */
export type AdditionalStart = { entry: RegistryEntry; base?: string | undefined };

/**
 * Makes each additional project's worktree in order on the session's branch, from its `base` if
 * new (sessionWorktree: an unheld one there is taken as it is), each written to the record and
 * noted in `made` as it is made. One already on the record (a start retried after a kill) stays.
 * With `setupBeside`, a `setupWhile: parallel` setup runs in a Setup session it opens; one that
 * cannot open is a warning, and the worktree waits for its setup to be run by hand.
 */
export async function createAdditional(
  deps: { profile: Profile; run: Runner; lock: AsyncLockDeps; store: SessionStore },
  record: SessionRecord,
  entries: readonly AdditionalStart[],
  made: ReturnType<typeof launchWorktrees>,
  /** Where each new worktree's warning (createWorktree) goes. */
  warnings: (string | undefined)[] = [],
  setupBeside?: SetupBeside,
): Promise<SessionRecord> {
  const branch = record.worktree?.branch;
  if (branch === undefined)
    throw new MesaError('internal', 'additional projects need the session worktree first');
  let current = record;
  for (const { entry, base } of entries) {
    if (current.additional?.some((a) => a.project === entry.name)) continue;
    const selected = await sessionWorktree(
      deps.profile,
      deps.run,
      deps.lock,
      deps.store,
      entry,
      branch,
      base,
      Boolean(setupBeside),
    );
    made.add(deps.profile, entry, selected);
    warnings.push(selected.warning);
    const added = { project: entry.name, worktree: selected.worktree };
    current = deps.store.update(current.id, (r) => ({
      additional: [...(r.additional ?? []), added],
    }));
    // On the record first, so the Setup session finds this worktree as its folder.
    if (selected.setup && setupBeside)
      await openSetupBeside(
        setupBeside,
        current,
        entry,
        { worktree: selected.worktree, setup: selected.setup },
        made,
        warnings,
      );
  }
  return current;
}
