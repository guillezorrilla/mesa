// @vitest-environment happy-dom
import type { ManagedRow } from '@mesa/core';
import { expect, test } from 'vitest';
import { fakeBridge, managedRow, renderWithMesa } from '@/lib/testing';
import { ArchiveDialog } from './ArchiveDialog';

const titled = (id: string, name: string) => managedRow(id, { name }) as ManagedRow;
const render = (rows: ManagedRow[]) =>
  renderWithMesa(
    <ArchiveDialog
      rows={rows}
      disabled={false}
      onArchive={() => {}}
      onDelete={() => {}}
      onCancel={() => {}}
    />,
    fakeBridge().bridge,
  );
const buttons = (dialog: HTMLElement | undefined) =>
  [...(dialog?.querySelectorAll('button') ?? [])].map((button) => button.textContent);

test('several rows are confirmed together by title, with how many running ones end', async () => {
  const byTestId = await render([
    titled('aaaaaaaa', 'Fix the lantern'),
    titled('bbbbbbbb', 'Tune the tide'),
    titled('cccccccc', 'Sweep the cove'),
  ]);
  const dialog = byTestId('archive-dialog')[0];
  expect(dialog?.querySelector('h2')?.textContent).toBe('Archive 3 sessions?');
  expect([...(dialog?.querySelectorAll('li') ?? [])].map((li) => li.textContent)).toEqual([
    'Fix the lantern',
    'Tune the tide',
    'Sweep the cove',
  ]);
  expect(dialog?.textContent).toContain('This will terminate 3 running sessions.');
  expect(buttons(dialog)).not.toContain('Delete permanently');
  expect(byTestId('archive-confirm')[0]?.textContent).toBe('Archive 3 sessions');
});

test('more than five rows list five titles, then how many more', async () => {
  const byTestId = await render(
    ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((letter) =>
      titled(letter.repeat(8), `Session ${letter}`),
    ),
  );
  const items = [...(byTestId('archive-dialog')[0]?.querySelectorAll('li') ?? [])];
  expect(items.map((li) => li.textContent)).toEqual([
    'Session a',
    'Session b',
    'Session c',
    'Session d',
    'Session e',
    'and 2 more',
  ]);
});

test('one row keeps the single-session text and Delete permanently', async () => {
  const byTestId = await render([titled('aaaaaaaa', 'Fix the lantern')]);
  const dialog = byTestId('archive-dialog')[0];
  expect(dialog?.querySelector('h2')?.textContent).toBe('Archive this session?');
  expect(dialog?.textContent).toContain(
    'This will terminate "Fix the lantern" and its tmux process. This action cannot be undone.',
  );
  expect(dialog?.querySelectorAll('li')).toHaveLength(0);
  expect(buttons(dialog)).toContain('Delete permanently');
  expect(byTestId('archive-confirm')[0]?.textContent).toBe('Archive session');
});

test('several recoverable rows are dismissed, as one recoverable row is', async () => {
  const ended = (id: string) =>
    managedRow(id, {
      alive: false,
      lastState: { state: 'done', confidence: 1, at: '2026-09-27T12:00:00.000Z', source: 'tmux' },
    }) as ManagedRow;
  let byTestId = await render([ended('aaaaaaaa')]);
  expect(byTestId('archive-dialog')[0]?.querySelector('h2')?.textContent).toBe(
    'Dismiss this session?',
  );
  expect(byTestId('archive-confirm')[0]?.textContent).toBe('Dismiss session');
  byTestId = await render([ended('aaaaaaaa'), ended('bbbbbbbb'), ended('cccccccc')]);
  expect(byTestId('archive-dialog')[0]?.querySelector('h2')?.textContent).toBe(
    'Dismiss 3 sessions?',
  );
  expect(byTestId('archive-confirm')[0]?.textContent).toBe('Dismiss 3 sessions');
  expect(byTestId('archive-dialog')[0]?.textContent).not.toContain('terminate');
});
