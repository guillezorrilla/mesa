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
  label: string;
  path: string;
  /** The project's preferred agent, else the profile's default. */
  agent: string | null;
  priority: number | null;
  skills: string[];
  /** False when the directory or its mesa.yaml is gone; the other fields are then unknown. */
  exists: boolean;
  pinned: boolean;
  hidden: boolean;
};

export type ProjectUpdate = {
  label?: string;
  pinned?: boolean;
  hidden?: boolean;
  move?: 'up' | 'down';
};

/**
 * Registers the project in `dir` (an absolute path). With `create` and no mesa.yaml, a minimal
 * one named after the folder is written, but only once the registration is known not to clash.
 */
export function registerProject(
  profile: Profile,
  opts: { dir: string; create?: boolean; label?: string },
): { project: Project; path: string; created: boolean; label?: string } {
  const label = validatedLabel(opts.label);
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
    return [...entries, { name: project.name, path, ...(label !== undefined ? { label } : {}) }];
  });
  return { project, path, created, ...(label !== undefined ? { label } : {}) };
}

export function listProjects(profile: Profile): ProjectRow[] {
  return readRegistry(profile.paths.registry).map(({ name, path, label, pinned, hidden }) => {
    const display = {
      name,
      label: label ?? name,
      path,
      pinned: pinned ?? false,
      hidden: hidden ?? false,
    };
    if (!existsSync(projectFile(path))) {
      return { ...display, agent: null, priority: null, skills: [], exists: false };
    }
    const p = readProjectFile(path);
    const agent = p.agent ?? profile.config.defaultAgent;
    return { ...display, agent, priority: p.priority, skills: p.skills ?? [], exists: true };
  });
}

/** Change only profile-local presentation; never rename mesa.yaml or historical session links. */
export function updateProject(profile: Profile, name: string, patch: ProjectUpdate): RegistryEntry {
  if (!Object.keys(patch).length) throw new MesaError('usage', 'set a label, pin, hide, or move');
  const label = validatedLabel(patch.label);
  let updated: RegistryEntry | undefined;
  updateRegistry(profile.paths.registry, (entries) => {
    const index = entries.findIndex((entry) => entry.name === name);
    if (index < 0) throw new MesaError('not_found', `no project named ${name}; see mesa projects`);
    const next = [...entries];
    const original = next[index];
    if (!original) throw new MesaError('internal', 'project registry changed while updating');
    updated = {
      ...original,
      ...(label !== undefined ? { label } : {}),
      ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
      ...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}),
    };
    next[index] = updated;
    if (patch.move) {
      const step = patch.move === 'up' ? -1 : 1;
      let neighbor = index + step;
      while (next[neighbor] && Boolean(next[neighbor]?.pinned) !== Boolean(updated.pinned)) {
        neighbor += step;
      }
      const peer = next[neighbor];
      if (peer) {
        next[index] = peer;
        next[neighbor] = updated;
      }
    }
    return next;
  });
  if (!updated) throw new MesaError('internal', 'project registry update produced no result');
  return updated;
}

function validatedLabel(value: string | undefined) {
  const label = value?.trim();
  if (
    value !== undefined &&
    (!label ||
      label.length > 80 ||
      [...label].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ))
  ) {
    throw new MesaError('usage', 'project label must be 1-80 characters on one line');
  }
  return label;
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

/** Routine workspace visits stay in profile metadata, without vault receipts. */
export function visitProject(profile: Profile, name: string, at: string): RegistryEntry {
  let visited: RegistryEntry | undefined;
  updateRegistry(profile.paths.registry, (entries) => {
    const index = entries.findIndex((entry) => entry.name === name);
    const entry = entries[index];
    if (!entry) throw new MesaError('not_found', `no project named ${name}; see mesa projects`);
    visited = {
      ...entry,
      visits: (entry.visits ?? 0) + 1,
      visitedAt: entry.visitedAt && entry.visitedAt > at ? entry.visitedAt : at,
    };
    entries[index] = visited;
    return entries;
  });
  if (!visited) throw new MesaError('internal', 'project registry update produced no result');
  return visited;
}
