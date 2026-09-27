import { sessionLabel } from '../display.js';
import type { ProjectRow } from '../projects/projects.js';
import type { TreeRow } from '../sessions/board/tree.js';

export type SearchHit = {
  kind: 'action' | 'setting' | 'project' | 'session';
  id: string;
  label: string;
  detail: string;
  disabled?: boolean;
};

const ACTIONS: SearchHit[] = [
  { kind: 'action', id: 'board', label: 'Board', detail: 'All sessions' },
  { kind: 'action', id: 'grid', label: 'Open Grid View', detail: 'Live session terminals' },
  { kind: 'action', id: 'new-session', label: 'New session', detail: 'Start an agent' },
  { kind: 'action', id: 'projects', label: 'Projects', detail: 'Manage registered projects' },
  { kind: 'action', id: 'doctor', label: 'Doctor', detail: 'Check Mesa health' },
  { kind: 'action', id: 'help', label: 'Help', detail: 'Commands and guidance' },
  {
    kind: 'action',
    id: 'open-vault',
    label: 'Open in Obsidian',
    detail: "Open this profile's vault",
  },
];

const SETTINGS: SearchHit[] = [
  {
    kind: 'setting',
    id: 'profile',
    label: 'Profile and vault',
    detail: 'Current profile and vault',
  },
  { kind: 'setting', id: 'skills', label: 'Manage skills', detail: 'Browse and sync skills' },
  { kind: 'setting', id: 'shortcuts', label: 'Keyboard shortcuts', detail: 'View and change keys' },
];

/** The same bounded project/session/action index serves `mesa search` and the app palette. */
export function searchWorkspace(
  projects: readonly ProjectRow[],
  sessions: readonly TreeRow[],
  query: string,
): SearchHit[] {
  const term = query.trim().toLocaleLowerCase();
  const matches = (hit: SearchHit) =>
    !term || `${hit.label} ${hit.detail} ${hit.id}`.toLocaleLowerCase().includes(term);
  const actions = ACTIONS.map((hit) =>
    hit.id === 'new-session'
      ? { ...hit, disabled: !projects.some((project) => project.exists) }
      : hit,
  ).filter(matches);
  const settings = SETTINGS.filter(matches);
  const projectHits = projects
    .map(
      (project): SearchHit => ({
        kind: 'project',
        id: project.name,
        label: project.label,
        detail: `${project.name} · ${project.path}`,
      }),
    )
    .filter(matches)
    .slice(0, 50);
  const sessionHits = [...sessions]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map(
      (session): SearchHit => ({
        kind: 'session',
        id: session.id,
        label: sessionLabel(session),
        detail: `${session.project ?? 'General'} · ${session.agent} · ${session.lastState.state}`,
      }),
    )
    .filter(matches)
    .slice(0, term ? 50 : 8);
  return [...actions, ...settings, ...projectHits, ...sessionHits];
}
