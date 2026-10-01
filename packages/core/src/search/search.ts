import { sessionLabel } from '../display.js';
import type { ProjectRow } from '../projects/projects.js';
import type { SavedPrompt } from '../prompts/prompts.js';
import type { TreeRow } from '../sessions/board/tree.js';

export type SearchHit = {
  kind: 'action' | 'setting' | 'project' | 'session' | 'prompt' | 'vault';
  id: string;
  label: string;
  detail: string;
  disabled?: boolean;
};

const ACTIONS: SearchHit[] = [
  { kind: 'action', id: 'sessions', label: 'Sessions', detail: 'Open session workspace' },
  { kind: 'action', id: 'grid', label: 'Open Grid View', detail: 'Live session terminals' },
  { kind: 'action', id: 'new-session', label: 'New session', detail: 'Start an agent' },
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
  { kind: 'setting', id: 'shortcuts', label: 'Keyboard shortcuts', detail: 'View and change keys' },
  { kind: 'setting', id: 'preferences', label: 'Preferences', detail: 'Display and terminal' },
  { kind: 'setting', id: 'prompts', label: 'Saved prompts', detail: 'Manage reusable text' },
  {
    kind: 'setting',
    id: 'backup',
    label: 'Local backup',
    detail: 'Create or restore a profile backup',
  },
];

/**
 * The same bounded project/session/action index serves `mesa search` and the app palette. Typed
 * text also offers Search vault, last, its id the text (Vault search).
 */
export function searchWorkspace(
  projects: readonly ProjectRow[],
  sessions: readonly TreeRow[],
  query: string,
  prompts: readonly SavedPrompt[] = [],
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
  const promptHits = prompts
    .map(
      (prompt): SearchHit => ({
        kind: 'prompt',
        id: prompt.name,
        label: prompt.name,
        detail: 'Insert saved prompt',
      }),
    )
    .filter(matches)
    .slice(0, 50);
  const text = query.trim();
  const vault: SearchHit[] = text
    ? [
        {
          kind: 'vault',
          id: text,
          label: 'Search vault',
          detail: `"${text}" in this profile's vault`,
        },
      ]
    : [];
  return [...actions, ...settings, ...projectHits, ...sessionHits, ...promptHits, ...vault];
}
