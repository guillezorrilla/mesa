// @vitest-environment happy-dom
import { act } from 'react';
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { FilesWorkspace } from './FilesWorkspace';

test('a late file read cannot replace the newer selection', async () => {
  const checkout = { project: 'lantern-cove', path: '/tmp/lantern-cove', registered: true };
  const pending = new Map<string, (answer: unknown) => void>();
  const { bridge } = fakeBridge({
    'files tree': () =>
      envelope({
        checkout,
        entries: [
          { path: 'a.md', kind: 'file', depth: 0 },
          { path: 'b.md', kind: 'file', depth: 0 },
        ],
        truncated: false,
      }),
    'files read': (args) => new Promise((resolve) => pending.set(args.at(-1) ?? '', resolve)),
  });
  const byTestId = await renderWithMesa(
    <FilesWorkspace project="lantern-cove" sessions={[]} onDirtyChange={() => {}} />,
    bridge,
  );
  const rows = [...document.querySelectorAll<HTMLButtonElement>('[aria-label="File tree"] button')];
  await click(rows[0]);
  await click(rows[1]);
  const answer = (path: string) =>
    envelope({ checkout, path, text: path, revision: 'a'.repeat(64), lines: 1 });
  await act(async () => pending.get('b.md')?.(answer('b.md')));
  expect((byTestId('file-editor-text')[0] as HTMLTextAreaElement).value).toBe('b.md');
  await act(async () => pending.get('a.md')?.(answer('a.md')));
  expect((byTestId('file-editor-text')[0] as HTMLTextAreaElement).value).toBe('b.md');
});
