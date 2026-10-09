// @vitest-environment happy-dom
import type { ImportListRow, ImportResult } from '@mesa/core';
import { act, useState } from 'react';
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa, toasts } from '@/lib/testing';
import { ImportTab } from './ImportTab';

/** ImportTab with Write notes held as the project screen holds it. */
function NotesImportTab(props: { project: string; onStartSession: (from: string) => void }) {
  const [notes, setNotes] = useState(true);
  return <ImportTab {...props} notes={notes} onNotesChange={setNotes} />;
}

const ISSUE: ImportListRow = {
  source: 'jira',
  id: 'LC-12',
  url: 'https://lantern-cove.atlassian.net/browse/LC-12',
  title: 'LC-12: Fix the tide alarm',
  fetched: '2026-09-24T12:00',
  snapshot: 'raw/jira/LC-12/2026-09-24T1200.md',
  note: 'wiki/notes/lc-12-fix-the-tide-alarm.md',
};
const PAGE: ImportListRow = {
  source: 'web',
  id: 'example-test',
  url: 'https://example.test/',
  title: 'Example',
  fetched: '2026-09-24T12:00',
  snapshot: 'raw/web/example-test/2026-09-24T1200.md',
};
const imported = (row: ImportListRow, notes?: ImportResult['notes']) =>
  envelope({
    project: 'lantern-cove',
    items: [row],
    ...(notes ? { notes } : {}),
    receipt: { id: 'r1', path: 'receipts/r1.md' },
  });

const type = (field: HTMLInputElement, text: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[data-testid="import-tab"] button')].find(
    (b) => b.textContent === label || b.getAttribute('aria-label') === label,
  );
const field = () => document.querySelector<HTMLInputElement>('[aria-label="Link to import"]');
const rows = () => [...document.querySelectorAll('[data-testid="import-item"]')];

test('a pasted link imports with Write notes on, and the item then lists with Refresh and Open in Obsidian', async () => {
  let items: ImportListRow[] = [];
  const { bridge, calls } = fakeBridge({
    'import list': () => envelope({ items }),
    import: () => {
      items = [ISSUE];
      return imported(ISSUE, { ok: true, session: 's1' });
    },
    'import refresh': () => imported(ISSUE, { ok: false, reason: 'claude exited with status 1' }),
    'vault open': () => envelope({ opened: true, method: 'uri', target: 'x' }),
  });
  const started: string[] = [];
  const byTestId = await renderWithMesa(
    <NotesImportTab project="lantern-cove" onStartSession={(from) => started.push(from)} />,
    bridge,
  );
  expect(byTestId('import-tab')[0]?.textContent).toContain('Nothing imported yet.');
  expect(button('Write notes')?.getAttribute('aria-checked')).toBe('true');

  await type(field() as HTMLInputElement, ' LC-12 ');
  await click(button('Import'));
  expect(calls).toContainEqual(['--json', 'import', '--project', 'lantern-cove', '--', 'LC-12']);
  expect(field()?.value).toBe('');
  expect(rows().map((row) => row.textContent)).toEqual([
    'jiraLC-12: Fix the tide alarm2026-09-24T12:00',
  ]);
  expect(toasts(byTestId)).toContainEqual(['confirmation', 'Imported LC-12: Fix the tide alarm']);

  await click(button('Start session from LC-12'));
  expect(started).toEqual(['LC-12']);
  await click(button('Open LC-12 in Obsidian'));
  expect(calls).toContainEqual(['--json', 'vault', 'open', '--', ISSUE.note]);

  // Refresh tells why the notes were not written.
  await click(button('Refresh LC-12'));
  expect(calls).toContainEqual([
    '--json',
    'import',
    'refresh',
    '--project',
    'lantern-cove',
    '--',
    'LC-12',
  ]);
  expect(toasts(byTestId)).toContainEqual([
    'alert',
    'Imported LC-12: Fix the tide alarm; notes not written: claude exited with status 1',
  ]);
});

test('with Write notes off an import passes --no-notes, and an item without a note opens its snapshot', async () => {
  const { bridge, calls } = fakeBridge({
    'import list': () => envelope({ items: [PAGE] }),
    import: () => imported(PAGE),
    'vault open': () => envelope({ opened: true, method: 'uri', target: 'x' }),
  });
  await renderWithMesa(
    <NotesImportTab project="lantern-cove" onStartSession={() => undefined} />,
    bridge,
  );
  await click(button('Write notes'));
  await type(field() as HTMLInputElement, 'https://example.test/');
  await click(button('Import'));
  expect(calls).toContainEqual([
    '--json',
    'import',
    '--project',
    'lantern-cove',
    '--no-notes',
    '--',
    'https://example.test/',
  ]);
  await click(button('Open example-test in Obsidian'));
  expect(calls).toContainEqual(['--json', 'vault', 'open', '--', PAGE.snapshot]);
});

test('Refresh changed items passes the explicit flag and keeps checked, skipped and refreshed visible', async () => {
  const { bridge, calls } = fakeBridge({
    'import list': () => envelope({ items: [ISSUE] }),
    'import refresh': () =>
      envelope({
        project: 'lantern-cove',
        items: [],
        checked: ['LC-12'],
        skipped: ['LC-12'],
        refreshed: [],
      }),
  });
  await renderWithMesa(
    <NotesImportTab project="lantern-cove" onStartSession={() => undefined} />,
    bridge,
  );
  await click(button('Refresh changed items'));
  expect(calls).toContainEqual([
    '--json',
    'import',
    'refresh',
    '--project',
    'lantern-cove',
    '--changed-only',
    '--',
  ]);
  expect(document.querySelector('[role="status"]')?.textContent).toBe(
    'Checked 1, skipped 1, refreshed 0',
  );
});
