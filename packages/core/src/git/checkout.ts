import { realpathSync } from 'node:fs';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { findProject } from '../projects/projects.js';
import { gitCommand } from './command.js';

export type Checkout = { project: string; path: string; registered: boolean };

function realPath(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    throw new MesaError('not_found', `checkout ${path} is unavailable`);
  }
}

/** Only the registered project's root or one of Git's linked worktrees is selectable. */
export async function resolveCheckout(
  profile: Profile,
  run: Runner,
  project: string,
  selected?: string,
): Promise<Checkout> {
  const root = realPath(findProject(profile, project).path);
  const top = await gitCommand(run, root, ['rev-parse', '--show-toplevel']);
  if (!top.ok || realPath(top.stdout.trim()) !== root) {
    throw new MesaError('usage', `${root} is not the top folder of a Git repository`);
  }
  const path = selected ? realPath(selected) : root;
  const listed = await gitCommand(run, root, ['worktree', 'list', '--porcelain', '-z']);
  if (!listed.ok) throw new MesaError('usage', `cannot list worktrees: ${listed.detail}`);
  const paths = listed.stdout
    .split('\0')
    .filter((field) => field.startsWith('worktree '))
    .flatMap((field) => {
      // Git can still list a prunable worktree whose folder is already gone.
      try {
        return [realpathSync.native(field.slice('worktree '.length))];
      } catch {
        return [];
      }
    });
  if (!paths.includes(path)) {
    throw new MesaError('usage', `${path} is not a worktree of project ${project}`);
  }
  const selectedTop = await gitCommand(run, path, ['rev-parse', '--show-toplevel']);
  if (!selectedTop.ok || realPath(selectedTop.stdout.trim()) !== path) {
    throw new MesaError('usage', `${path} is not the top folder of a Git worktree`);
  }
  return { project, path, registered: path === root };
}
