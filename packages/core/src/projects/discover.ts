import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { projectFile, readProjectFile, slugify } from './project-file.js';
import { readRegistry } from './registry.js';

export type DiscoveredProject = {
  path: string;
  name: string;
  configured: boolean;
  registered: boolean;
  error?: string;
};

/** A folder that can be a project: what discovery says of it before the registry is asked. */
export type ProjectCandidate = Omit<DiscoveredProject, 'registered'>;

/**
 * `path` as a project candidate when it holds mesa.yaml or `.git`: named by its mesa.yaml, else
 * by its folder; an unreadable mesa.yaml is its `error`. None for any other folder.
 */
export function projectCandidate(path: string): ProjectCandidate | undefined {
  const configured = existsSync(projectFile(path));
  if (!configured && !existsSync(join(path, '.git'))) return undefined;
  let name = slugify(basename(path));
  let error: string | undefined;
  if (configured) {
    try {
      name = readProjectFile(path).name;
    } catch {
      error = 'Invalid mesa.yaml';
    }
  }
  return { path, name, configured, ...(error ? { error } : {}) };
}

/** A bounded local scan: at most 500 folders, three levels below the chosen root, 100 results. */
export function discoverProjects(profile: Profile, root: string): DiscoveredProject[] {
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new MesaError('not_found', `${root} is not a folder`);
  }
  const start = realpathSync(root);
  const registered = new Set(readRegistry(profile.paths.registry).map((entry) => entry.path));
  const pending = [{ path: start, depth: 0 }];
  const found: DiscoveredProject[] = [];
  let visited = 0;
  while (pending.length && visited < 500 && found.length < 100) {
    const current = pending.shift();
    if (!current) break;
    visited++;
    const candidate = projectCandidate(current.path);
    if (candidate) {
      const { error, ...fields } = candidate;
      found.push({
        ...fields,
        registered: registered.has(current.path),
        ...(error ? { error } : {}),
      });
      continue;
    }
    if (current.depth === 3) continue;
    // ponytail: readdir loads one directory at a time; stream it if a chosen root has millions of entries.
    for (const child of readdirSync(current.path, { withFileTypes: true })) {
      if (!child.isDirectory() || child.name.startsWith('.') || child.name === 'node_modules')
        continue;
      if (visited + pending.length >= 500) break;
      pending.push({ path: join(current.path, child.name), depth: current.depth + 1 });
    }
  }
  return found;
}
