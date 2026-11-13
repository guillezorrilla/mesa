import type { PhoneRow } from '@mesa/core/phone';
import { expect, test } from 'vitest';
import {
  applyUpdates,
  filterRows,
  groupRows,
  isGate,
  mergeListings,
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

test('rows group as Needs you, Working, Done, keeping the Mac order inside each', () => {
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
