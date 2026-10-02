import { createHash } from 'node:crypto';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import type { Project } from '../projects/project-file.js';
import { type RegistryEntry, updateRegistry } from '../projects/registry.js';

/** The worktree commands a project's mesa.yaml may name, which run on this machine. */
export const WORKTREE_SCRIPTS = ['setup', 'teardown'] as const;
export type WorktreeScript = (typeof WORKTREE_SCRIPTS)[number];
export type WorktreeScripts = Partial<Record<WorktreeScript, string[]>>;

/** What an approval holds: the sha256 of the exact argv, so any change asks again. */
export const scriptFingerprint = (argv: readonly string[]) =>
  createHash('sha256').update(JSON.stringify(argv)).digest('hex');

/**
 * The project's own setup and teardown this profile has not approved, by script. An empty list
 * runs nothing, so it needs no approval.
 */
export function unapprovedScripts(project: Project, entry: RegistryEntry): WorktreeScripts {
  const pending: WorktreeScripts = {};
  for (const script of WORKTREE_SCRIPTS) {
    const argv = project.worktrees?.[script];
    if (argv?.length && entry.approved?.[script] !== scriptFingerprint(argv))
      pending[script] = argv;
  }
  return pending;
}

/** The refusal for scripts a person has not approved, naming each exact argv. */
export function needsApproval(name: string, pending: WorktreeScripts): MesaError {
  const list = Object.entries(pending)
    .map(([script, argv]) => `${script} ${JSON.stringify(argv)}`)
    .join(', ');
  return new MesaError(
    'needs_approval',
    `${name}'s mesa.yaml runs ${list}, which this profile has not approved: review it, then run mesa projects trust ${name}`,
    { project: name, scripts: pending },
  );
}

/**
 * Records, in the profile's registry, approval of exactly these argvs for the project; a script
 * given as undefined or empty loses its approval.
 */
export function approveScripts(profile: Profile, name: string, scripts: WorktreeScripts): void {
  updateRegistry(profile.paths.registry, (entries) =>
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
