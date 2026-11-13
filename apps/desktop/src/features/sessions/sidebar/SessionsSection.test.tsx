// @vitest-environment happy-dom
import type { CrewReport, TreeRow } from '@mesa/core';
import { expect, test } from 'vitest';
import { click, fakeBridge, managedRow, PROJECTS, renderWithMesa } from '@/lib/testing';
import type { WorkspaceView } from '@/lib/workspaceView';
import { UnreadContext } from '../useUnread';
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
  // Alive and idle after `mesa report done`: its row shows the check, not the idle clock.
  child('buoys001', 2, {
    name: 'buoy-lights',
    lastState: idle(),
    report: { kind: 'done', at: at(3), message: 'All 3 tests pass. Merged.' },
    lastReply: { text: 'Not this one', at: at(3) },
  }),
  child('tides001', 3, {
    name: 'tides',
    lastReply: { text: '\nChecking the tide table\nmore', at: at(4) },
  }),
  // The coordinator's own Setup session, which passed, and one worker's, which failed.
  setup('setup001', 'coord001'),
  setup('setup002', 'tides001', { setupFailed: true }),
  // A worker that reported done shows no setup failure.
  setup('setup003', 'buoys001', { setupFailed: true }),
  // Mesa's own Vault capture run, live and ended, and a worker that ended: nothing to open.
  child('capture1', 4, { kind: 'run', goal: '/vault-capture' }),
  child('capture2', 4, { kind: 'run', goal: '/vault-capture', ...ended() }),
  child('ended001', 4, { name: 'ended', ...ended() }),
  // A worker whose terminal went away unasked keeps its row, which opens its Restore.
  child('lost0001', 5, { name: 'lost', alive: false }),
];

function ended() {
  return { alive: false, endedAt: at(6), lastState: { ...idle(), state: 'done' as const } };
}

function idle() {
  return { state: 'idle' as const, confidence: 1, at: at(1), source: 'hook' as const };
}

/** Unread as the app reads it: a row's own mark. */
const UNREAD = {
  unread: (row: TreeRow) => row.managed && row.unread === true,
  mark: () => {},
  toggleShown: () => {},
};

async function sidebar(sessions = SESSIONS) {
  const views: WorkspaceView[] = [];
  const groups = sidebarGroups(PROJECTS, sessions);
  const byTestId = await renderWithMesa(
    <UnreadContext.Provider value={UNREAD}>
      <SessionsSection
        groups={groups}
        onBoard={sessions.map((s) => s.id)}
        order={sidebarOrder(groups, [])}
        view={{ kind: 'session', id: 'coord001' }}
        onView={(view) => views.push(view)}
        closedProjects={[]}
        onToggleProject={() => {}}
        compactSessions={[]}
        onToggleCompact={() => {}}
        chosen={[]}
        onSelection={() => {}}
      />
    </UnreadContext.Provider>,
    fakeBridge().bridge,
  );
  return { byTestId, views, groups };
}

test("a coordinator's card holds a row per worker it can open; Setup sessions and Skill runs are neither", async () => {
  const { byTestId, groups } = await sidebar();
  expect(byTestId('sidebar-session').map((card) => card.dataset.sessionId)).toEqual(['coord001']);
  expect(sidebarOrder(groups, [])).toEqual(['coord001']);
  const rows = byTestId('sidebar-worker');
  expect(rows.map((row) => row.dataset.sessionId)).toEqual([
    'charts01',
    'buoys001',
    'tides001',
    'lost0001',
  ]);
  // Titled by its task when it has one, else by its session title.
  expect(rows.map((row) => row.title)).toEqual([
    'Open Document freeBerths',
    'Open buoy-lights',
    'Open tides',
    'Open lost',
  ]);
  expect(rows[1]?.querySelector('[data-state]')?.getAttribute('aria-label')).toBe('Done');
  // The selected coordinator's fill stays on its own lines, so its rows keep their colours.
  expect(byTestId('sidebar-session')[0]?.className).toContain('bg-ring/15');
  expect(rows[0]?.closest('ul')?.parentElement?.className).not.toContain('bg-ring/15');
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
  // Only the unsettled worker whose setup failed has the mark: the coordinator's passed, and the
  // done worker's failure no longer matters.
  expect(marks).toHaveLength(1);
  expect(
    marks[0]?.closest('li')?.querySelector('[data-session-id]')?.getAttribute('data-session-id'),
  ).toBe('tides001');
  await click(marks[0]);
  expect(views).toEqual([
    { kind: 'session', id: 'tides001' },
    { kind: 'session', id: 'setup002' },
  ]);
});

test("a worker row's icon follows what it reported once it stops working", async () => {
  const said = (kind: CrewReport['kind']) => ({ report: { kind, at: at(3), message: 'Said so.' } });
  const { byTestId } = await sidebar([
    SESSIONS[0] as (typeof SESSIONS)[number],
    child('done0001', 1, { lastState: idle(), ...said('done') }),
    child('fail0001', 2, { lastState: idle(), ...said('failed') }),
    child('block001', 3, { lastState: idle(), ...said('blocked') }),
    child('asks0001', 4, { lastState: idle(), asking: true }),
    child('busy0001', 5, said('done')),
    child('rest0001', 6, { lastState: idle(), ...said('finished') }),
  ]);
  const icons = byTestId('sidebar-worker').map((row) =>
    row.querySelector('[data-state]')?.getAttribute('aria-label'),
  );
  expect(icons).toEqual(['Done', 'Failed', 'Waiting on you', 'Waiting on you', 'Working', 'Idle']);
});

test("a worker's setup failed mark is an icon on its title line, beside its time", async () => {
  const { byTestId } = await sidebar();
  const mark = byTestId('setup-failed')[0];
  const line = mark?.parentElement;
  // One overlay holds the mark and the time; the row's title clears room for both.
  // The icon alone, named for screen readers and in its tooltip; the time follows it.
  expect(mark?.textContent).toBe('');
  expect(mark?.getAttribute('aria-label')).toBe('Setup failed, click to open its Setup session');
  expect(mark?.title).toBe('Setup failed, click to open its Setup session');
  expect(line?.textContent).not.toBe('');
  expect(line?.className).toContain('absolute');
  const row = line?.closest('li')?.querySelector('[data-testid="sidebar-worker"]');
  expect(row?.querySelector('.pr-15')?.textContent).toBe('tides');
});

test("a child's row is filled while its reply is unread, as a card is", async () => {
  const { byTestId } = await sidebar([
    SESSIONS[0] as (typeof SESSIONS)[number],
    child('read0001', 1, { lastState: idle() }),
    child('news0001', 2, { name: 'news', lastState: idle(), unread: true }),
  ]);
  const rows = byTestId('sidebar-worker');
  expect(rows.map((row) => row.dataset.unread)).toEqual([undefined, 'true']);
  expect(rows[1]?.title).toBe('Open news, unread');
  expect(rows[1]?.className).toContain('bg-state-unread/25');
});
