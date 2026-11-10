// @vitest-environment happy-dom
import type { TreeRow } from '@mesa/core';
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, managedRow, renderWithMesa } from '@/lib/testing';
import { SessionCard } from './SessionCard';

const session = {
  ...managedRow('aaaaaaaa', {
    gitBranch: 'tides',
    pr: { number: 12, state: 'open', url: 'https://github.example/lantern-cove/pull/12' },
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

test('a compact card shows none of them', async () => {
  const byTestId = await card(true);
  expect(byTestId('session-pr')).toEqual([]);
  expect(byTestId('session-lines')).toEqual([]);
  expect(byTestId('session-reply')).toEqual([]);
});

test("a card on a branch with a pull request shows its number in its state's colour, and a click opens it without selecting the card", async () => {
  const selected: unknown[] = [];
  const { bridge, calls } = fakeBridge({
    'browser external': (args) => envelope({ url: args.at(-1), opened: true }),
  });
  const withPr = (state: 'open' | 'draft' | 'merged' | 'closed') =>
    ({
      ...session,
      pr: { number: 123, state, url: 'https://github.example/lantern-cove/pull/123' },
    }) as TreeRow;
  const byTestId = await renderWithMesa(
    <>
      {(['open', 'draft', 'merged', 'closed'] as const).map((state) => (
        <SessionCard
          key={state}
          session={withPr(state)}
          selected={false}
          chosen={false}
          unread={false}
          compact={false}
          onToggleCompact={() => {}}
          onSelect={(keys) => selected.push(keys)}
          onStep={() => {}}
          chosenCount={1}
          onArchiveChosen={() => {}}
          onMarkChosen={() => {}}
        />
      ))}
    </>,
    bridge,
  );
  const badges = byTestId('session-pr');
  expect(badges.map((badge) => badge.textContent)).toEqual(['#123', '#123', '#123', '#123']);
  expect(badges.map((badge) => badge.className.match(/text-[a-z-]+/)?.[0])).toEqual([
    'text-issue-open',
    'text-muted-foreground',
    'text-issue-closed',
    'text-state-failed',
  ]);
  await click(badges[0]);
  expect(calls).toContainEqual([
    '--json',
    'browser',
    'external',
    '--',
    'https://github.example/lantern-cove/pull/123',
  ]);
  expect(selected).toEqual([]);
});
