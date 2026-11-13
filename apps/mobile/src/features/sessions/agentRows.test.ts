import type { PhoneRow } from '@mesa/core/phone';
import { expect, test } from 'vitest';
import {
  applyUpdates,
  filterRows,
  groupRows,
  isGate,
  mergeListings,
  needsYouCount,
  placeOf,
  projectsOf,
} from './agentRows';
import { groupOf } from './sessionState';

const row = (id: string, state: string, more: Partial<PhoneRow> = {}): PhoneRow => ({
  id,
  title: `Session ${id}`,
  project: 'mesa',
  state,
  since: '2026-11-11T00:00:00.000Z',
  context: null,
  unread: false,
  ...more,
});

test('rows group as Needs you, Working, Done, ties in id order inside each', () => {
  const rows = [
    row('a', 'idle'),
    row('b', 'waiting-question'),
    row('c', 'working'),
    row('d', 'waiting-permission'),
  ];
  expect(groupRows(rows).map((s) => [s.title, s.data.map((r) => r.id)])).toEqual([
    ['Needs you', ['b', 'd']],
    ['Working', ['c']],
    ['Done', ['a']],
  ]);
  expect(groupRows([row('a', 'done')]).map((s) => s.key)).toEqual(['done']);
  expect(groupOf('queued')).toBe('working');
  expect(groupOf('some-new-state')).toBe('done');
});

const at = (minutesAgo: number) =>
  new Date(Date.UTC(2026, 10, 11, 12) - minutesAgo * 60_000).toISOString();

test('each group lists the newest first, by the time its row shows, ties by id', () => {
  const rows = [
    row('d1', 'done', { since: at(3 * 24 * 60) }),
    row('d2', 'done', { since: at(3 * 60) }),
    row('w1', 'working', { since: at(9) }),
    row('d3', 'idle', { since: at(1), project: 'cinder', unread: true }),
    row('w2', 'working', { since: at(0) }),
    row('n1', 'waiting-question', { since: at(5) }),
    row('d5', 'done', { since: at(1), project: 'cinder' }),
    row('d4', 'done', { since: at(1), unread: true }),
  ];
  const ids = (shown: readonly PhoneRow[]) =>
    groupRows(shown).map((s) => [s.key, s.data.map((r) => r.id)]);
  expect(ids(rows)).toEqual([
    ['needs-you', ['n1']],
    ['working', ['w2', 'w1']],
    ['done', ['d3', 'd4', 'd5', 'd2', 'd1']],
  ]);
  // The order holds through the Unread and project filters.
  expect(ids(filterRows(rows, { query: '', unreadOnly: true }))).toEqual([['done', ['d3', 'd4']]]);
  expect(ids(filterRows(rows, { query: '', project: 'cinder', unreadOnly: false }))).toEqual([
    ['done', ['d3', 'd5']],
  ]);
  // A session that just replied moves to the top of its group, whatever order the Mac gives.
  const replied = applyUpdates(rows, [
    { kind: 'update', rows: [row('d1', 'idle', { since: at(0) })], gone: [], order: [] },
  ]);
  expect(ids(replied).at(-1)).toEqual(['done', ['d1', 'd3', 'd4', 'd5', 'd2']]);
});

test('open decision gates come first in Needs you, even with no session waiting', () => {
  const gate = {
    id: 'g-1',
    question: 'Metres?',
    options: ['m', 'ft'],
    task: 'Tides',
    coordinator: 'a',
  };
  const sections = groupRows([row('b', 'waiting-question'), row('c', 'working')], [gate]);
  expect(sections.map((s) => [s.key, s.data.map((item) => item.id)])).toEqual([
    ['needs-you', ['g-1', 'b']],
    ['working', ['c']],
  ]);
  expect(sections[0]?.data.map(isGate)).toEqual([true, false]);
  expect(groupRows([], [gate]).map((s) => s.key)).toEqual(['needs-you']);
});

test("updates change rows, drop gone ones, add new ones, and take the Mac's order", () => {
  const rows = [row('a', 'working'), row('b', 'idle'), row('d', 'idle')];
  const next = applyUpdates(rows, [
    {
      kind: 'update',
      rows: [row('d', 'waiting-question'), row('c', 'working')],
      gone: ['b'],
      order: ['d', 'a', 'c'],
    },
  ]);
  expect(next.map((r) => [r.id, r.state])).toEqual([
    ['d', 'waiting-question'],
    ['a', 'working'],
    ['c', 'working'],
  ]);
  // A mark made on the phone gives no order: the row changes where it is.
  const marked = applyUpdates(next, [
    { kind: 'update', rows: [row('a', 'working', { unread: true })], gone: [], order: [] },
  ]);
  expect(marked.map((r) => [r.id, r.unread])).toEqual([
    ['d', false],
    ['a', true],
    ['c', false],
  ]);
});

test('the filter matches title, project or ask, one project, and unread only', () => {
  const rows = [
    row('a', 'idle', { title: 'Login fix', unread: true }),
    row('b', 'idle', { project: 'cinder' }),
    row('w', 'waiting-question', { ask: 'Which harbour chart?' }),
  ];
  expect(filterRows(rows, { query: 'harbour', unreadOnly: false }).map((r) => r.id)).toEqual(['w']);
  expect(filterRows(rows, { query: 'login', unreadOnly: false }).map((r) => r.id)).toEqual(['a']);
  expect(filterRows(rows, { query: 'CINDER', unreadOnly: false }).map((r) => r.id)).toEqual(['b']);
  expect(
    filterRows(rows, { query: '', project: 'cinder', unreadOnly: false }).map((r) => r.id),
  ).toEqual(['b']);
  expect(filterRows(rows, { query: '', unreadOnly: true }).map((r) => r.id)).toEqual(['a']);
  expect(projectsOf([...rows.slice(0, 2), row('c', 'idle', { project: null })])).toEqual([
    'cinder',
    'mesa',
  ]);
});

test("several Macs' rows merge in pairing order, each with its own updates, and the Mac filter keeps one", () => {
  const listings = [
    { mac: 'studio', rows: [row('a', 'working')], at: 10 },
    { mac: 'laptop', rows: [row('b', 'idle')], at: 10 },
  ];
  const updates = [
    {
      kind: 'update' as const,
      mac: 'laptop',
      at: 20,
      rows: [row('b', 'done')],
      gone: [],
      order: [],
    },
    {
      kind: 'update' as const,
      mac: 'studio',
      at: 5,
      rows: [row('a', 'done')],
      gone: [],
      order: [],
    },
  ];
  const merged = mergeListings(listings, updates);
  expect(merged.map((r) => [r.mac, r.id, r.state])).toEqual([
    ['studio', 'a', 'working'],
    ['laptop', 'b', 'done'],
  ]);
  expect(
    filterRows(merged, { query: '', unreadOnly: false, mac: 'laptop' }).map((r) => r.id),
  ).toEqual(['b']);
});

test('a row names its Mac only among several', () => {
  expect(placeOf('mesa', 'Studio')).toBe('mesa on Studio');
  expect(placeOf(null, 'Studio')).toBe('Studio');
  expect(placeOf('mesa')).toBe('mesa');
});

test('Needs you counts every open gate and every waiting session, whatever the filter', () => {
  const gate = { id: 'g-1', question: 'Metres?', options: ['m'], task: 'Tides', coordinator: 'a' };
  const rows = [
    row('a', 'waiting-question'),
    row('b', 'waiting-permission', { project: 'other' }),
    row('c', 'working'),
    row('d', 'done', { unread: true }),
  ];
  expect(needsYouCount(rows, [gate])).toBe(3);
  expect(needsYouCount([], [])).toBe(0);
});
