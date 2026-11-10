// @vitest-environment happy-dom
import type { TreeRow } from '@mesa/core';
import { expect, test } from 'vitest';
import { fakeBridge, managedRow, renderWithMesa } from '@/lib/testing';
import { SessionCard } from './SessionCard';

const session = {
  ...managedRow('aaaaaaaa', {
    gitBranch: 'tides',
    lines: { added: 12, removed: 3 },
    lastReply: { text: 'Added the tide table.\nAll tests pass.', at: '2026-09-25T12:01:00.000Z' },
  }),
  depth: 0,
} as TreeRow;

const card = (compact: boolean) =>
  renderWithMesa(
    <SessionCard
      session={session}
      selected={false}
      chosen={false}
      unread={false}
      compact={compact}
      onToggleCompact={() => {}}
      onSelect={() => {}}
      onStep={() => {}}
      chosenCount={1}
      onArchiveChosen={() => {}}
      onMarkChosen={() => {}}
    />,
    fakeBridge().bridge,
  );

test('a card shows the lines its work changed after its branch, and its last reply in one line', async () => {
  const byTestId = await card(false);
  const lines = byTestId('session-lines')[0];
  expect(lines?.textContent).toBe('+12 -3');
  expect(lines?.querySelector('.text-state-idle')?.textContent).toBe('+12');
  expect(lines?.querySelector('.text-state-failed')?.textContent).toBe('-3');
  const reply = byTestId('session-reply')[0];
  expect(reply?.textContent).toBe('Added the tide table.');
  expect(reply?.getAttribute('title')).toBe('Added the tide table.\nAll tests pass.');
});

test('a compact card shows neither', async () => {
  const byTestId = await card(true);
  expect(byTestId('session-lines')).toEqual([]);
  expect(byTestId('session-reply')).toEqual([]);
});
