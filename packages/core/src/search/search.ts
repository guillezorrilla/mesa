import { matchSorter, rankings } from 'match-sorter';
import { DEFAULT_SHORTCUTS, FIXED_SHORTCUTS, type Shortcuts } from '../profile/shortcuts.js';
import type { ProjectRow } from '../projects/projects.js';
import type { SavedPrompt } from '../prompts/prompts.js';
import type { TreeRow } from '../sessions/board/tree.js';
import { projectLabel } from '../sessions/record/general.js';
import { additionalLabel, sessionBranch, sessionLabel } from '../sessions/record/labels.js';
import { isOver } from '../sessions/record/lifecycle.js';
import { WAITING_STATES } from '../sessions/record/states.js';

/** A fixed command's hit carries its `CommandId`; the rest an id their kind gives them. */
export type SearchHit = (
  | { kind: 'navigation' | 'action' | 'setting'; id: CommandId }
  | { kind: 'project' | 'session' | 'prompt' | 'vault'; id: string }
  /** The Impact of one project or one session; `id` only keeps hits apart. */
  | { kind: 'impact'; id: string; project?: string; session?: string }
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
  | 'impact'
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
    {
      kind: 'navigation',
      id: 'impact',
      label: 'Impact',
      detail: 'What Mesa decided and kept for you',
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
      detail: 'Jump to an open session, what needs you first',
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

/** The switcher's group with no text: waiting on a person, then unread, then idle, then the rest. */
const need = (s: TreeRow) =>
  WAITING_STATES.has(s.lastState.state)
    ? 0
    : s.managed && s.unread
      ? 1
      : s.lastState.state === 'idle'
        ? 2
        : 3;

/** The Session switcher's order with no text: by `need`, each group newest first. */
const byNeed = (a: TreeRow, b: TreeRow) =>
  need(a) - need(b) || b.lastState.at.localeCompare(a.lastState.at);

/** `hits` with those whose id is in `first` moved to the front, each part in its order. */
const putFirst = (hits: SearchHit[], first: ReadonlySet<string>) => [
  ...hits.filter((hit) => hit.kind === 'session' && first.has(hit.id)),
  ...hits.filter((hit) => !(hit.kind === 'session' && first.has(hit.id))),
];

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
 * hit and offers Search vault last, its id the text (Vault search). A session's detail holds its
 * branch and pull request, and `#123` or `123` puts the sessions with that pull request first.
 * `sessionsOnly` returns the session hits alone, with no text in `byNeed` order (Session switcher).
 */
export function searchWorkspace(
  projects: readonly ProjectRow[],
  sessions: readonly TreeRow[],
  query: string,
  options: SearchOptions = {},
): SearchHit[] {
  const text = query.trim();
  // `#123` or `123`: the sessions whose branch has that pull request rank first.
  const number = /^#?(\d+)$/.exec(text)?.[1];
  const withPr = new Set(
    sessions.filter((s) => s.managed && String(s.pr?.number) === number).map((s) => s.id),
  );
  const sessionHits = [...sessions]
    .filter((session) => text || !isOver(session))
    .sort(options.sessionsOnly && !text ? byNeed : byActivity)
    .map((session): SearchHit => {
      const pr = session.managed && session.pr ? `#${session.pr.number}` : undefined;
      return {
        kind: 'session',
        id: session.id,
        label: sessionLabel(session),
        detail: [
          [projectLabel(session.project ?? null), additionalLabel(session)]
            .filter(Boolean)
            .join(' '),
          session.agent,
          session.lastState.state,
          sessionBranch(session),
          pr,
        ]
          .filter(Boolean)
          .join(' · '),
      };
    });
  if (options.sessionsOnly)
    return putFirst(ranked(sessionHits, text), withPr).slice(0, GROUP_LIMIT);
  const hits = putFirst(
    ranked(
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
    ),
    withPr,
  );
  // Groups in the order of their best hit, which with no text is the fixed order above.
  const grouped = [...new Set(hits.map((hit) => hit.kind))].flatMap((kind) =>
    hits
      .filter((hit) => hit.kind === kind)
      .slice(0, kind === 'session' && !text ? RECENT_SESSIONS : GROUP_LIMIT),
  );
  // Impact of each project and session, after every other group and only for typed text: with
  // none they would crowd the palette, and they never push a project or session down.
  const impact = text
    ? ranked(
        [
          ...projects.map(
            (project): SearchHit => ({
              kind: 'impact',
              id: `project:${project.name}`,
              project: project.name,
              label: `Impact: ${project.label}`,
              detail: 'What Mesa decided and kept in this project',
            }),
          ),
          ...sessionHits.map(
            (session): SearchHit => ({
              kind: 'impact',
              id: `session:${session.id}`,
              session: session.id,
              label: `Impact: ${session.label}`,
              detail: 'What Mesa decided and kept in this session',
            }),
          ),
        ],
        text,
      ).slice(0, GROUP_LIMIT)
    : [];
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
  return [...grouped, ...impact, ...vault];
}
