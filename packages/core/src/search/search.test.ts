import { expect, test } from 'vitest';
import type { ProjectRow } from '../projects/projects.js';
import type { TreeRow } from '../sessions/board/tree.js';
import { searchWorkspace } from './search.js';

const projects: ProjectRow[] = [
  {
    name: 'lantern-cove',
    label: 'Lantern Cove',
    path: '/src/lantern-cove',
    agent: 'claude',
    priority: 0.5,
    skills: [],
    exists: true,
    pinned: false,
    hidden: false,
  },
];
const session = (id: string, startedAt: string) =>
  ({
    id,
    managed: true,
    project: 'lantern-cove',
    agent: 'claude',
    startedAt,
    lastState: { state: 'working' },
  }) as TreeRow;

test('search groups real destinations, matches labels and slugs, and puts recent sessions first', () => {
  const sessions = [session('aaaaaaaa', '2026-09-25'), session('bbbbbbbb', '2026-09-26')];
  const all = searchWorkspace(projects, sessions, '');
  expect(all.filter((hit) => hit.kind === 'session').map((hit) => hit.id)).toEqual([
    'bbbbbbbb',
    'aaaaaaaa',
  ]);
  expect(searchWorkspace(projects, sessions, 'Lantern').map((hit) => hit.id)).toEqual([
    'lantern-cove',
    'bbbbbbbb',
    'aaaaaaaa',
  ]);
  expect(searchWorkspace(projects, sessions, 'no-match')).toEqual([]);
  expect(searchWorkspace([], [], 'New session')[0]?.disabled).toBe(true);
});
