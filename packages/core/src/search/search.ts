import { matchSorter, rankings } from 'match-sorter';
import { DEFAULT_SHORTCUTS, FIXED_SHORTCUTS, type Shortcuts } from '../profile/shortcuts.js';
import type { ProjectRow } from '../projects/projects.js';
import type { SavedPrompt } from '../prompts/prompts.js';
import type { TreeRow } from '../sessions/board/tree.js';
import { projectLabel } from '../sessions/record/general.js';
import { additionalLabel, sessionLabel } from '../sessions/record/labels.js';
import { isOver } from '../sessions/record/lifecycle.js';

/** A fixed command's hit carries its `CommandId`; the rest an id their kind gives them. */
export type SearchHit = (
  | { kind: 'navigation' | 'action' | 'setting'; id: CommandId }
  | { kind: 'project' | 'session' | 'prompt' | 'vault'; id: string }
) & {
  label: string;
  detail: string;
  /** The key that does the same, as `Mod+Shift+K`. */
  shortcut?: string;
  disabled?: boolean;
};

/** The fixed hits' ids: the app picks their icons and actions by these. */
export type CommandId =
  | 'sessions'
  | 'grid'
  | 'automations'
  | 'doctor'
  | 'help'
  | 'new-session'
  | 'switch-session'
  | 'shortcuts'
  | 'open-vault'
  | 'profile'
  | 'preferences'
  | 'prompts'
  | 'backup'
  | 'smarter-decisions';

/** Places to go, things to do, and settings, with the profile's keys on the hits that have one. */
function commands(shortcuts: Shortcuts, canStart: boolean): SearchHit[] {
  return [
    {
      kind: 'navigation',
      id: 'sessions',
      label: 'Sessions',
      detail: 'Open session workspace',
      shortcut: shortcuts.board,
    },
    {
      kind: 'navigation',
      id: 'grid',
      label: 'Open Grid View',
      detail: 'View all sessions in a grid',
    },
    {
      kind: 'navigation',
      id: 'automations',
      label: 'Automations',
      detail: 'Manage optional profile rules',
    },
    { kind: 'navigation', id: 'doctor', label: 'Doctor', detail: "Check Mesa's health" },
    { kind: 'navigation', id: 'help', label: 'Help', detail: 'Read commands and guidance' },
    {
      kind: 'action',
      id: 'new-session',
      label: 'New session',
      detail: canStart ? 'Start an agent in a project' : 'Add a project first',
      shortcut: shortcuts.newSession,
      ...(canStart ? {} : { disabled: true }),
    },
    {
      kind: 'action',
      id: 'switch-session',
      label: 'Switch session',
      detail: 'Jump to an open session by last activity',
      shortcut: shortcuts.switchSession,
    },
    {
      kind: 'action',
      id: 'shortcuts',
      label: 'Show keyboard shortcuts',
      detail: 'View and change keys',
      shortcut: FIXED_SHORTCUTS.keyboardShortcuts,
    },
    {
      kind: 'action',
      id: 'open-vault',
      label: 'Open in Obsidian',
      detail: "Open this profile's vault in Obsidian",
    },
    {
      kind: 'setting',
      id: 'profile',
      label: 'Profile settings',
      detail: 'Change the current profile and its settings',
    },
    {
      kind: 'setting',
      id: 'preferences',
      label: 'Preferences',
      detail: 'Change display and terminal options',
    },
    { kind: 'setting', id: 'prompts', label: 'Saved prompts', detail: 'Manage reusable text' },
    {
      kind: 'setting',
      id: 'backup',
      label: 'Local backup',
      detail: 'Create or restore a profile backup',
    },
    {
      kind: 'setting',
      id: 'smarter-decisions',
      label: 'Set up smarter decisions',
      detail: 'Connect a decision model so sessions get the right notes',
    },
  ];
}

/** At most this many hits of a kind; the palette's sessions with no text, fewer. */
const GROUP_LIMIT = 50;
const RECENT_SESSIONS = 8;

/** Open sessions first, each part by last activity, newest first. */
const byActivity = (a: TreeRow, b: TreeRow) =>
  Number(isOver(a)) - Number(isOver(b)) || b.lastState.at.localeCompare(a.lastState.at);

/**
 * Hits ranked by match-sorter: every label match first, then the hits whose detail or id contains
 * the text, each part best first; ties keep the input order.
 */
function ranked(hits: SearchHit[], text: string): SearchHit[] {
  if (!text) return hits;
  const baseSort = (a: { index: number }, b: { index: number }) => a.index - b.index;
  const byLabel = matchSorter(hits, text, { keys: ['label'], baseSort });
  const matched = new Set(byLabel);
  const rest = hits.filter((hit) => !matched.has(hit));
  return [
    ...byLabel,
    ...matchSorter(rest, text, { keys: ['detail', 'id'], threshold: rankings.CONTAINS, baseSort }),
  ];
}

export type SearchOptions = {
  prompts?: readonly SavedPrompt[];
  /** The profile's keys, shown on the hits they trigger. */
  shortcuts?: Shortcuts;
  /** Only session hits: the session switcher. */
  sessionsOnly?: boolean;
};

/**
 * The bounded index behind `mesa search` and the app palette, best match first. With no text,
 * groups come in a fixed order and only open sessions show; typed text orders groups by their best
 * hit and offers Search vault last, its id the text (Vault search). `sessionsOnly` returns the
 * session hits alone (Session switcher).
 */
export function searchWorkspace(
  projects: readonly ProjectRow[],
  sessions: readonly TreeRow[],
  query: string,
  options: SearchOptions = {},
): SearchHit[] {
  const text = query.trim();
  const sessionHits = [...sessions]
    .filter((session) => text || !isOver(session))
    .sort(byActivity)
    .map(
      (session): SearchHit => ({
        kind: 'session',
        id: session.id,
        label: sessionLabel(session),
        detail: `${[projectLabel(session.project ?? null), additionalLabel(session)].filter(Boolean).join(' ')} · ${session.agent} · ${session.lastState.state}`,
      }),
    );
  if (options.sessionsOnly) return ranked(sessionHits, text).slice(0, GROUP_LIMIT);
  const hits = ranked(
    [
      ...commands(
        options.shortcuts ?? DEFAULT_SHORTCUTS,
        projects.some((project) => project.exists),
      ),
      ...projects.map(
        (project): SearchHit => ({
          kind: 'project',
          id: project.name,
          label: project.label,
          detail: `${project.name} · ${project.path}`,
        }),
      ),
      ...sessionHits,
      ...(options.prompts ?? []).map(
        (prompt): SearchHit => ({
          kind: 'prompt',
          id: prompt.name,
          label: prompt.name,
          detail: 'Insert saved prompt',
        }),
      ),
    ],
    text,
  );
  // Groups in the order of their best hit, which with no text is the fixed order above.
  const grouped = [...new Set(hits.map((hit) => hit.kind))].flatMap((kind) =>
    hits
      .filter((hit) => hit.kind === kind)
      .slice(0, kind === 'session' && !text ? RECENT_SESSIONS : GROUP_LIMIT),
  );
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
  return [...grouped, ...vault];
}
