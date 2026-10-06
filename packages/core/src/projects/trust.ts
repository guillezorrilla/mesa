import { createHash } from 'node:crypto';
import type { LockDeps } from '../lib/lock-file.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import type { Project } from './project-file.js';
import { type RegistryEntry, updateRegistry } from './registry.js';

/** The worktree commands a project's mesa.yaml may name, which run on this machine. */
export const WORKTREE_SCRIPTS = ['setup', 'teardown'] as const;
export type WorktreeScript = (typeof WORKTREE_SCRIPTS)[number];
export type WorktreeScripts = Partial<Record<WorktreeScript, string[]>>;
/** A script waiting for approval: its exact argv and the fingerprint that approves it. */
export type PendingScripts = Partial<
  Record<WorktreeScript, { argv: string[]; fingerprint: string }>
>;

/** What an approval holds: the sha256 of the exact argv, so any change asks again. */
export const scriptFingerprint = (argv: readonly string[]) =>
  createHash('sha256').update(JSON.stringify(argv)).digest('hex');

/**
 * The project's own setup and teardown this profile has not approved, by script. An empty list
 * runs nothing, so it needs no approval.
 */
export function unapprovedScripts(project: Project, entry: RegistryEntry): PendingScripts {
  const pending: PendingScripts = {};
  for (const script of WORKTREE_SCRIPTS) {
    const argv = project.worktrees?.[script];
    const fingerprint = argv && scriptFingerprint(argv);
    if (argv?.length && fingerprint && entry.approved?.[script] !== fingerprint)
      pending[script] = { argv, fingerprint };
  }
  return pending;
}

/** Each pending script as a person reviews it: its exact argv and its fingerprint. */
export const describePending = (pending: PendingScripts) =>
  Object.entries(pending)
    .map(([script, { argv, fingerprint }]) => `${script} ${JSON.stringify(argv)} (${fingerprint})`)
    .join(', ');

/** The command that approves exactly these scripts, and nothing the file says after a change. */
export const trustCommand = (name: string, pending: PendingScripts) =>
  `mesa projects trust ${name} ${Object.values(pending)
    .map(({ fingerprint }) => `--expect ${fingerprint}`)
    .join(' ')}`;

/** The refusal for scripts a person has not approved, naming each exact argv. */
export function needsApproval(name: string, pending: PendingScripts): MesaError {
  return new MesaError(
    'needs_approval',
    `${name}'s mesa.yaml runs ${describePending(pending)}, which this profile has not approved: review it, then run ${trustCommand(name, pending)}`,
    { project: name, scripts: pending },
  );
}

/** Approval comes from a person: the app or a terminal, never an agent inside a Mesa window. */
export const APPROVAL_FROM_SESSION =
  'worktree scripts can only be approved from the Mesa app or a terminal outside a Mesa session';

/**
 * Records, in the profile's registry, approval of exactly these argvs for the project; a script
 * given as undefined or empty loses its approval.
 */
export function approveScripts(
  profile: Profile,
  name: string,
  scripts: WorktreeScripts,
  lock: LockDeps,
): void {
  updateRegistry(lock, profile.paths.registry, (entries) =>
    entries.map((entry) => {
      if (entry.name !== name) return entry;
      const approved = { ...entry.approved };
      for (const script of Object.keys(scripts) as WorktreeScript[]) {
        const argv = scripts[script];
        if (argv?.length) approved[script] = scriptFingerprint(argv);
        else delete approved[script];
      }
      const { approved: _, ...rest } = entry;
      return Object.keys(approved).length ? { ...rest, approved } : rest;
    }),
  );
}
