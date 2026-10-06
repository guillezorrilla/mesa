import { expect, test } from 'vitest';
import { DEFAULT_SHORTCUTS } from '../profile/shortcuts.js';
import type { ProjectRow } from '../projects/projects.js';
import type { TreeRow } from '../sessions/board/tree.js';
import { searchWorkspace } from './search.js';

const project = (name: string, label: string): ProjectRow => ({
  name,
  label,
  path: `/src/${name}`,
  agent: 'claude',
  priority: 0.5,
  skills: [],
  overrides: {},
  terminalTheme: 'follow',
  unapproved: {},
  exists: true,
  pinned: false,
  hidden: false,
});
const projects = [project('lantern-cove', 'Lantern Cove')];
const session = (id: string, at: string, state = 'working') =>
  ({
    id,
    managed: true,
    project: 'lantern-cove',
    agent: 'claude',
    startedAt: '2026-09-01T00:00:00.000Z',
    lastState: { state, at },
  }) as TreeRow;
const ids = (hits: { id: string }[]) => hits.map((hit) => hit.id);

test('with no text, groups come in a fixed order', () => {
  const kinds = searchWorkspace(projects, [session('aaaaaaaa', '2026-09-25T00:00:00.000Z')], '', {
    prompts: [{ name: 'review', text: 'Review this' }],
  }).map((hit) => hit.kind);
  expect([...new Set(kinds)]).toEqual([
    'navigation',
    'action',
    'setting',
    'project',
    'session',
    'prompt',
  ]);
});

test('typed text orders groups by their best hit, so the first row is the best match', () => {
  expect(searchWorkspace(projects, [], 'ogv')[0]).toMatchObject({
    kind: 'navigation',
    id: 'grid',
    label: 'Open Grid View',
  });
  expect(searchWorkspace(projects, [], 'grid')[0]?.id).toBe('grid');
  expect(searchWorkspace(projects, [], 'lantrn')[0]?.id).toBe('lantern-cove');
  const kinds = searchWorkspace(projects, [], 'settings').map((hit) => hit.kind);
  expect(kinds[0]).toBe('setting');
});

test('a label match outranks a hit that only mentions the text in its detail', () => {
  const near = { ...project('tide-pool', 'Tide Pool'), path: '/src/lantern-tide' };
  expect(ids(searchWorkspace([near, ...projects], [], 'lantern'))).toEqual([
    'lantern-cove',
    'tide-pool',
    'lantern',
  ]);
  // An id that starts with the text still ranks below a label word that does.
  const beacon = project('lantern-beacon', 'Beacon');
  const old = project('old-lantern', 'Old Lantern');
  expect(ids(searchWorkspace([beacon, old], [], 'lantern')).slice(0, 2)).toEqual([
    'old-lantern',
    'lantern-beacon',
  ]);
  // So does a detail that contains it, below a label acronym.
  const tools = { ...project('tide-pool', 'Tide Pool'), path: '/src/hlc-tools' };
  expect(ids(searchWorkspace([tools, ...projects], [], 'lc')).slice(0, 2)).toEqual([
    'lantern-cove',
    'tide-pool',
  ]);
});

test('hits carry descriptions, and the keys that trigger them from the profile', () => {
  const rebound = { ...DEFAULT_SHORTCUTS, switchSession: 'Mod+Shift+J' };
  const hits = searchWorkspace([], [], '', { shortcuts: rebound });
  expect(hits.find((hit) => hit.id === 'switch-session')).toEqual({
    kind: 'action',
    id: 'switch-session',
    label: 'Switch session',
    detail: 'Jump to an open session by last activity',
    shortcut: 'Mod+Shift+J',
  });
  expect(hits.find((hit) => hit.id === 'new-session')).toMatchObject({
    shortcut: 'Mod+N',
    detail: 'Add a project first',
    disabled: true,
  });
  expect(hits.find((hit) => hit.id === 'shortcuts')).toMatchObject({
    kind: 'action',
    shortcut: 'Mod+/',
  });
  expect(hits.find((hit) => hit.id === 'sessions')).toMatchObject({
    kind: 'navigation',
    shortcut: 'Mod+1',
  });
  expect(hits.every((hit) => hit.detail.length > 0)).toBe(true);
  expect(searchWorkspace(projects, [], '').find((hit) => hit.id === 'new-session')?.disabled).toBe(
    undefined,
  );
});

test('sessions list open ones by last activity; ended ones only when typed, below open ones', () => {
  const sessions = [
    session('older000', '2026-09-24T00:00:00.000Z'),
    session('ended000', '2026-09-27T00:00:00.000Z', 'done'),
    session('newer000', '2026-09-26T00:00:00.000Z'),
  ];
  const sessionIds = (query: string) =>
    ids(searchWorkspace(projects, sessions, query).filter((hit) => hit.kind === 'session'));
  expect(sessionIds('')).toEqual(['newer000', 'older000']);
  expect(sessionIds('lantern')).toEqual(['newer000', 'older000', 'ended000']);
  const many = Array.from({ length: 10 }, (_, i) =>
    session(`s${i}`, `2026-09-1${i}T00:00:00.000Z`),
  );
  expect(searchWorkspace(projects, many, '').filter((hit) => hit.kind === 'session')).toHaveLength(
    8,
  );
});

test('the sessions-only mode returns only session hits, in the same order', () => {
  const sessions = [
    session('older000', '2026-09-24T00:00:00.000Z'),
    session('ended000', '2026-09-27T00:00:00.000Z', 'stopped'),
    session('newer000', '2026-09-26T00:00:00.000Z'),
  ];
  expect(ids(searchWorkspace(projects, sessions, '', { sessionsOnly: true }))).toEqual([
    'newer000',
    'older000',
  ]);
  expect(ids(searchWorkspace(projects, sessions, 'claude', { sessionsOnly: true }))).toEqual([
    'newer000',
    'older000',
    'ended000',
  ]);
});

test('typed text offers Search vault last, with the text as its id; no text offers none', () => {
  expect(searchWorkspace(projects, [], '  harbour lights ').at(-1)).toEqual({
    kind: 'vault',
    id: 'harbour lights',
    label: 'Search vault',
    detail: `"harbour lights" in this profile's vault`,
  });
  expect(searchWorkspace(projects, [], 'zzqx').map((hit) => hit.kind)).toEqual(['vault']);
  expect(searchWorkspace(projects, [], ' ').some((hit) => hit.kind === 'vault')).toBe(false);
});

test('a session hit names its additional projects after its own', () => {
  const across = {
    ...session('aaaaaaaa', '2026-09-25T00:00:00.000Z'),
    additional: [
      { project: 'tide-pool', worktree: { path: '/w/tide-pool/b', branch: 'b' } },
      { project: 'driftwood', worktree: { path: '/w/driftwood/b', branch: 'b' } },
    ],
  } as TreeRow;
  const [hit] = searchWorkspace(projects, [across], 'aaaaaaaa');
  expect(hit?.detail).toBe('lantern-cove +tide-pool,driftwood · claude · working');
  expect(ids(searchWorkspace(projects, [across], 'driftwood'))).toContain('aaaaaaaa');
});
