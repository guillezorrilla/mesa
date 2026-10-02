import type { DiscoveredProject, Project, ProjectRow, ProjectSort } from '@mesa/core';
import { command, commandWith, type Recorded } from './spec';

/** Project commands: the registry, its order, and per-project settings. */
export const projectsCommands = {
  'projects.list': command<ProjectRow[]>('projects'),
  'projects.sorted': commandWith<ProjectSort, ProjectRow[]>((sort) => ['projects', '--sort', sort]),
  'projects.visit': commandWith<
    { name: string },
    { name: string; visits: number; visitedAt: string }
  >(({ name }) => ['projects', 'visit', '--', name]),
  'projects.discover': commandWith<{ path: string }, DiscoveredProject[]>(({ path }) => [
    'projects',
    'discover',
    '--',
    path,
  ]),
  'projects.clone': commandWith<
    { url: string },
    Recorded<Project & { path: string; created: boolean; url: string }>
  >(({ url }) => ['projects', 'clone', '--', url]),
  'projects.update': commandWith<
    { name: string; label?: string; pinned?: boolean; hidden?: boolean; move?: 'up' | 'down' },
    Recorded<{ name: string; path: string; label?: string; pinned?: boolean; hidden?: boolean }>
  >(({ name, label, pinned, hidden, move }) => [
    'projects',
    'update',
    ...(label !== undefined ? [`--label=${label}`] : []),
    ...(pinned !== undefined ? ['--pinned', String(pinned)] : []),
    ...(hidden !== undefined ? ['--hidden', String(hidden)] : []),
    ...(move ? ['--move', move] : []),
    '--',
    name,
  ]),
  'projects.set': commandWith<
    { name: string; path: string; value?: unknown },
    Recorded<{ project: string; path: string; value: unknown }>
  >(({ name, path, value }) =>
    value === undefined
      ? ['projects', 'set', '--unset', '--', name, path]
      : ['projects', 'set', '--', name, path, JSON.stringify(value)],
  ),
  'projects.trust': commandWith<
    { name: string; expect: string[] },
    Recorded<{ project: string; setup?: string[]; teardown?: string[] }>
  >(({ name, expect }) => [
    'projects',
    'trust',
    ...expect.flatMap((fingerprint) => ['--expect', fingerprint]),
    '--',
    name,
  ]),
  'projects.unregister': commandWith<{ name: string }, Recorded<{ name: string; path: string }>>(
    ({ name }) => ['unregister', '--', name],
  ),
  // `--` so a path starting with `-` is never read as a flag.
  'projects.register': commandWith<
    { path: string; label?: string },
    Recorded<Project & { path: string; created: boolean; label?: string }>
  >(({ path, label }) => [
    'register',
    '--create',
    ...(label !== undefined ? [`--label=${label}`] : []),
    '--',
    path,
  ]),
};
