import { GENERAL_PROJECT } from '@mesa/core/browser';
import { expect, test } from 'vitest';
import { managedRow, PROJECTS } from '@/lib/testing';
import { nextSelection, type SessionSelection, selectedIds } from './sessionSelection';
import { sidebarGroups, sidebarOrder } from './sidebarGroups';

const ended = (id: string) =>
  managedRow(id, {
    alive: false,
    lastState: { state: 'done', confidence: 1, at: '2026-09-27T12:00:00.000Z', source: 'tmux' },
  });
const groups = sidebarGroups(PROJECTS, [
  ended('recover1'),
  managedRow('general1', { project: GENERAL_PROJECT }),
  managedRow('other001', { project: 'beta' }),
  managedRow('tide0001', { project: 'tide' }),
  managedRow('cove0001'),
  managedRow('cove0002'),
  managedRow('tide0002', { project: 'tide' }),
]);
const order = sidebarOrder(groups, []);
const click = (id: string, mods: { shift?: boolean; toggle?: boolean } = {}) =>
  ({ kind: 'click', id, ...mods }) as const;
/** The selected ids after each input in turn, from no selection, with `shown` shown. */
const after = (shown: string | undefined, ...inputs: Parameters<typeof nextSelection>[1][]) => {
  const selection = inputs.reduce<SessionSelection>(
    (current, input) => nextSelection(current, input, order, shown),
    {},
  );
  return selectedIds(selection, order, shown);
};

test('the rendered order is project groups, then General, Other, and Recoverable', () => {
  expect(order).toEqual([
    'cove0001',
    'cove0002',
    'tide0001',
    'tide0002',
    'general1',
    'other001',
    'recover1',
  ]);
  expect(sidebarOrder(groups, ['tide'])).toEqual([
    'cove0001',
    'cove0002',
    'general1',
    'other001',
    'recover1',
  ]);
});

test('with nothing chosen only the shown session is selected', () => {
  expect(after('tide0001')).toEqual(['tide0001']);
  expect(after(undefined)).toEqual([]);
});

test('a plain click selects only that card and makes it the anchor', () => {
  expect(after('tide0001', click('cove0002', { toggle: true }), click('general1'))).toEqual([
    'general1',
  ]);
  expect(after('tide0001', click('cove0002'), click('tide0002', { shift: true }))).toEqual([
    'cove0002',
    'tide0001',
    'tide0002',
  ]);
});

test('Shift-click ranges from the anchor downward and upward, inclusive', () => {
  expect(after('cove0001', click('cove0001'), click('tide0002', { shift: true }))).toEqual([
    'cove0001',
    'cove0002',
    'tide0001',
    'tide0002',
  ]);
  expect(after('cove0001', click('other001'), click('tide0002', { shift: true }))).toEqual([
    'tide0002',
    'general1',
    'other001',
  ]);
});

test('Shift-click with no anchor ranges from the shown session', () => {
  expect(after('cove0002', click('tide0002', { shift: true }))).toEqual([
    'cove0002',
    'tide0001',
    'tide0002',
  ]);
});

test('a Shift range skips the cards of a folded project', () => {
  const folded = sidebarOrder(groups, ['tide']);
  const selection = nextSelection(
    { anchor: 'cove0001' },
    click('other001', { shift: true }),
    folded,
    'cove0001',
  );
  expect(selectedIds(selection, folded, 'cove0001')).toEqual([
    'cove0001',
    'cove0002',
    'general1',
    'other001',
  ]);
});

test('Cmd-click toggles one card in and out and makes it the anchor', () => {
  expect(after('cove0001', click('tide0001', { toggle: true }))).toEqual(['cove0001', 'tide0001']);
  expect(
    after('cove0001', click('tide0001', { toggle: true }), click('cove0001', { toggle: true })),
  ).toEqual(['tide0001']);
  expect(
    after('cove0001', click('tide0001', { toggle: true }), click('other001', { shift: true })),
  ).toEqual(['tide0001', 'tide0002', 'general1', 'other001']);
});

test('Escape leaves only the shown session selected', () => {
  expect(after('cove0001', click('tide0001', { toggle: true }), { kind: 'escape' })).toEqual([
    'cove0001',
  ]);
});

test('right-click on an unselected card makes it the whole selection, on a selected one keeps it', () => {
  const two = [click('tide0001', { toggle: true })];
  expect(after('cove0001', ...two, { kind: 'context', id: 'cove0001' })).toEqual([
    'cove0001',
    'tide0001',
  ]);
  expect(after('cove0001', ...two, { kind: 'context', id: 'other001' })).toEqual(['other001']);
});

test('a card that is no longer listed drops out of the selection', () => {
  const selection = nextSelection({}, click('tide0001', { toggle: true }), order, 'cove0001');
  expect(
    selectedIds(
      selection,
      order.filter((id) => id !== 'tide0001'),
      'cove0001',
    ),
  ).toEqual(['cove0001']);
});
