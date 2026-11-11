// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { click, fakeBridge, managedRow, PROJECTS, renderWithMesa } from '@/lib/testing';
import type { WorkspaceView } from '@/lib/workspaceView';
import { SessionsSection } from './SessionsSection';
import { sidebarGroups, sidebarOrder } from './sidebarGroups';

const at = (minute: number) => `2026-09-25T12:0${minute}:00.000Z`;
const child = (id: string, minute: number, extra: Parameters<typeof managedRow>[1] = {}) =>
  managedRow(id, { parent: 'coord001', parentNow: 'coord001', startedAt: at(minute), ...extra });
const setup = (id: string, owner: string, extra: Parameters<typeof managedRow>[1] = {}) =>
  managedRow(id, {
    kind: 'terminal',
    agent: 'terminal',
    name: 'Setup',
    parent: owner,
    parentNow: owner,
    startedAt: at(5),
    ...extra,
  });

const SESSIONS = [
  managedRow('coord001', { name: 'Coordinate the harbor', lastState: { ...idle(), at: at(0) } }),
  child('charts01', 1, {
    taskTitle: 'Document freeBerths',
    progress: { text: 'Editing src/berths.ts', at: at(2) },
    report: { kind: 'finished', at: at(2), message: 'Older news. Not shown.' },
  }),
  child('buoys001', 2, {
    name: 'buoy-lights',
    lastState: { ...idle(), state: 'done' },
    report: { kind: 'done', at: at(3), message: 'All 3 tests pass. Merged.' },
    lastReply: { text: 'Not this one', at: at(3) },
  }),
  child('tides001', 3, {
    name: 'tides',
    lastReply: { text: '\nChecking the tide table\nmore', at: at(4) },
  }),
  // The coordinator's own Setup session, which passed, and one worker's, which failed.
  setup('setup001', 'coord001'),
  setup('setup002', 'buoys001', { setupFailed: true }),
];

function idle() {
  return { state: 'idle' as const, confidence: 1, at: at(1), source: 'hook' as const };
}

async function sidebar() {
  const views: WorkspaceView[] = [];
  const groups = sidebarGroups(PROJECTS, SESSIONS);
  const byTestId = await renderWithMesa(
    <SessionsSection
      groups={groups}
      onBoard={SESSIONS.map((s) => s.id)}
      order={sidebarOrder(groups, [])}
      view={{ kind: 'session', id: 'coord001' }}
      onView={(view) => views.push(view)}
      closedProjects={[]}
      onToggleProject={() => {}}
      compactSessions={[]}
      onToggleCompact={() => {}}
      chosen={[]}
      onSelection={() => {}}
    />,
    fakeBridge().bridge,
  );
  return { byTestId, views, groups };
}

test("a coordinator's card holds a row per worker, and Setup sessions are no cards", async () => {
  const { byTestId, groups } = await sidebar();
  expect(byTestId('sidebar-session').map((card) => card.dataset.sessionId)).toEqual(['coord001']);
  expect(sidebarOrder(groups, [])).toEqual(['coord001']);
  const rows = byTestId('sidebar-worker');
  expect(rows.map((row) => row.dataset.sessionId)).toEqual(['charts01', 'buoys001', 'tides001']);
  // Titled by its task when it has one, else by its session title.
  expect(rows.map((row) => row.title)).toEqual([
    'Open Document freeBerths',
    'Open buoy-lights',
    'Open tides',
  ]);
  expect(rows[1]?.querySelector('[data-state]')?.getAttribute('aria-label')).toBe('Done');
});

test('each worker row says what it is doing now: progress, else report, else last reply', async () => {
  const { byTestId } = await sidebar();
  expect(byTestId('worker-doing').map((line) => line.textContent)).toEqual([
    'Editing src/berths.ts',
    'All 3 tests pass.',
    'Checking the tide table',
  ]);
});

test('a worker row opens its session, and a failed setup mark opens the Setup session', async () => {
  const { byTestId, views } = await sidebar();
  await click(byTestId('sidebar-worker')[2]);
  const marks = byTestId('setup-failed');
  // Only the worker whose setup failed has the mark; the coordinator's passed.
  expect(marks).toHaveLength(1);
  expect(
    marks[0]?.closest('li')?.querySelector('[data-session-id]')?.getAttribute('data-session-id'),
  ).toBe('buoys001');
  await click(marks[0]);
  expect(views).toEqual([
    { kind: 'session', id: 'tides001' },
    { kind: 'session', id: 'setup002' },
  ]);
});
