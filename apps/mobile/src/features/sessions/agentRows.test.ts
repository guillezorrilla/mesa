import type { PhoneRow } from '@mesa/core/phone';
import { expect, test } from 'vitest';
import { applyUpdates, filterRows, groupRows, projectsOf } from './agentRows';
import { offlineText } from './offlineText';
import { groupOf, stateColor, stateWords } from './sessionState';

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

test('updates change rows in place, drop gone ones and add new ones at the end', () => {
  const rows = [row('a', 'working'), row('b', 'idle')];
  const next = applyUpdates(rows, [
    { kind: 'update', rows: [row('a', 'waiting-question'), row('c', 'working')], gone: ['b'] },
  ]);
  expect(next.map((r) => [r.id, r.state])).toEqual([
    ['a', 'waiting-question'],
    ['c', 'working'],
  ]);
});

test('the filter matches title or project, one project, and unread only', () => {
  const rows = [
    row('a', 'idle', { title: 'Login fix', unread: true }),
    row('b', 'idle', { project: 'cinder' }),
  ];
  expect(filterRows(rows, { query: 'login', unreadOnly: false }).map((r) => r.id)).toEqual(['a']);
  expect(filterRows(rows, { query: 'CINDER', unreadOnly: false }).map((r) => r.id)).toEqual(['b']);
  expect(
    filterRows(rows, { query: '', project: 'cinder', unreadOnly: false }).map((r) => r.id),
  ).toEqual(['b']);
  expect(filterRows(rows, { query: '', unreadOnly: true }).map((r) => r.id)).toEqual(['a']);
  expect(projectsOf([...rows, row('c', 'idle', { project: null })])).toEqual(['cinder', 'mesa']);
});

test('state words and colours, and the offline line', () => {
  expect(stateWords('waiting-permission')).toBe('Asking permission');
  expect(stateWords('later')).toBe('later');
  expect(stateColor('idle', true)).toBe('bg-state-unread');
  expect(stateColor('failed')).toBe('bg-state-failed');
  const now = Date.parse('2026-11-11T12:00:00.000Z');
  expect(offlineText(now - 5 * 60_000, now)).toBe(
    'Your Mac is not answering; it may be asleep or offline. Last heard from it 5m ago.',
  );
  expect(offlineText(undefined, now)).toMatch(/Nothing heard from it since the app opened\.$/);
});
