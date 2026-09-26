import { existsSync, realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import {
  DEFAULT_PRIORITY,
  minimalProject,
  type Project,
  projectFile,
  readProjectFile,
  writeProjectFile,
} from './project-file.js';
import { findClash, type RegistryEntry, readRegistry, updateRegistry } from './registry.js';

export type ProjectRow = {
  name: string;
  path: string;
  /** The project's preferred agent, else the profile's default. */
  agent: string | null;
  priority: number | null;
  skills: string[];
  /** False when the directory or its mesa.yaml is gone; the other fields are then unknown. */
  exists: boolean;
};

/**
 * Registers the project in `dir` (an absolute path). With `create` and no mesa.yaml, a minimal
 * one named after the folder is written, but only once the registration is known not to clash.
 */
export function registerProject(
  profile: Profile,
  opts: { dir: string; create?: boolean },
): { project: Project; path: string; created: boolean } {
  if (!existsSync(opts.dir)) throw new MesaError('not_found', `${opts.dir} does not exist`);
  const path = realpathSync(opts.dir);
  const created = Boolean(opts.create) && !existsSync(projectFile(path));
  const project = created ? minimalProject(path) : readProjectFile(path);
  updateRegistry(profile.paths.registry, (entries) => {
    const clash = findClash(entries, { name: project.name, path });
    if (clash) {
      throw new MesaError(
        'invalid_config',
        `already registered: ${clash.name} at ${clash.path}; run mesa unregister ${clash.name} first`,
      );
    }
    if (created) writeProjectFile(path, project);
    return [...entries, { name: project.name, path }];
  });
  return { project, path, created };
}

export function listProjects(profile: Profile): ProjectRow[] {
  return readRegistry(profile.paths.registry).map(({ name, path }) => {
    if (!existsSync(projectFile(path))) {
      return { name, path, agent: null, priority: null, skills: [], exists: false };
    }
    const p = readProjectFile(path);
    const agent = p.agent ?? profile.config.defaultAgent;
    return { name, path, agent, priority: p.priority, skills: p.skills ?? [], exists: true };
  });
}

/** The registry entry named `name`; not_found otherwise. */
export function findProject(profile: Profile, name: string): RegistryEntry {
  const entry = readRegistry(profile.paths.registry).find((e) => e.name === name);
  if (!entry) throw new MesaError('not_found', `no project named ${name}; see mesa projects`);
  return entry;
}

export function unregisterProject(profile: Profile, name: string): RegistryEntry {
  const entry = findProject(profile, name);
  updateRegistry(profile.paths.registry, (entries) => entries.filter((e) => e.name !== name));
  return entry;
}

/** The registered project `cwd` is in (the innermost), else the one named like its folder. */
export const projectOf = (cwd: string, projects: readonly RegistryEntry[]) => {
  const inside = projects
    .filter((p) => cwd === p.path || cwd.startsWith(`${p.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return (inside ?? projects.find((p) => p.name === basename(cwd)))?.name ?? null;
};

/**
 * Each registered project's priority, read once: 0.5 for one without (the default), and for
 * every project when the profile or its registry does not read.
 */
export function projectPriorities(open: () => Profile): (project: string | null) => number {
  let known = new Map<string, number>();
  try {
    known = new Map(listProjects(open()).map((p) => [p.name, p.priority ?? DEFAULT_PRIORITY]));
  } catch {
    // Every project counts as DEFAULT_PRIORITY.
  }
  return (project) => (project ? known.get(project) : undefined) ?? DEFAULT_PRIORITY;
}
