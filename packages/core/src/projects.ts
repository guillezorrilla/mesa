import { existsSync, realpathSync } from 'node:fs';
import type { Profile } from './profile.js';
import {
  minimalProject,
  type Project,
  projectFile,
  readProjectFile,
  writeProjectFile,
} from './project-file.js';
import { findClash, type RegistryEntry, readRegistry, writeRegistry } from './registry.js';
import { MesaError } from './result.js';

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
  const entries = readRegistry(profile.paths.registry);
  const clash = findClash(entries, { name: project.name, path });
  if (clash) {
    throw new MesaError(
      'invalid_config',
      `already registered: ${clash.name} at ${clash.path}; run mesa unregister ${clash.name} first`,
    );
  }
  if (created) writeProjectFile(path, project);
  writeRegistry(profile.paths.registry, [...entries, { name: project.name, path }]);
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

export function unregisterProject(profile: Profile, name: string): RegistryEntry {
  const entries = readRegistry(profile.paths.registry);
  const entry = entries.find((e) => e.name === name);
  if (!entry) throw new MesaError('not_found', `no project named ${name}; see mesa projects`);
  writeRegistry(
    profile.paths.registry,
    entries.filter((e) => e !== entry),
  );
  return entry;
}
