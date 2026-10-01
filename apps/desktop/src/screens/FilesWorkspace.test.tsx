// @vitest-environment happy-dom
import { act } from 'react';
import { expect, test } from 'vitest';
import { click, deferred, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
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
    <FilesWorkspace project="lantern-cove" onDirtyChange={() => {}} />,
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

test('a terminal file target selects its checkout and exact line', async () => {
  const checkout = { project: 'lantern-cove', path: '/tmp/feature', registered: false };
  const { bridge, calls } = fakeBridge({
    'files tree': () => envelope({ checkout, entries: [], truncated: false }),
    'files read': () =>
      envelope({
        checkout,
        path: 'docs/guide.md',
        text: 'one\ntwo\n',
        revision: 'a'.repeat(64),
        lines: 3,
        targetLine: 2,
      }),
  });
  const byTestId = await renderWithMesa(
    <FilesWorkspace
      project="lantern-cove"
      onDirtyChange={() => {}}
      target={{ checkout: '/tmp/feature', path: 'docs/guide.md', line: 2 }}
    />,
    bridge,
  );
  expect(
    calls.some(
      (args) =>
        args[1] === 'files' &&
        args[2] === 'read' &&
        args.includes('/tmp/feature') &&
        args.includes('2'),
    ),
  ).toBe(true);
  expect((byTestId('file-editor-text')[0] as HTMLTextAreaElement).selectionStart).toBe(4);
});

test('a manual worktree without a session is selectable for Files', async () => {
  const { bridge } = fakeBridge({
    'worktrees list': () =>
      envelope([
        { path: '/tmp/repo', main: true, state: 'ready', holders: [] },
        { path: '/tmp/manual', main: false, state: 'ready', holders: [] },
      ]),
    'files tree': () =>
      envelope({
        checkout: { project: 'lantern-cove', path: '/tmp/repo', registered: true },
        entries: [],
        truncated: false,
      }),
  });
  await renderWithMesa(<FilesWorkspace project="lantern-cove" onDirtyChange={() => {}} />, bridge);
  expect(document.querySelector('select[aria-label="Files checkout"]')?.textContent).toContain(
    '/tmp/manual',
  );
});

test('a save that lands after switching files keeps the newly opened file', async () => {
  const checkout = { project: 'lantern-cove', path: '/tmp/lantern-cove', registered: true };
  const written = deferred();
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
    'files read': (args) =>
      envelope({ checkout, path: args.at(-1), text: 'saved', revision: 'a'.repeat(64), lines: 1 }),
    'files write': () => written.promise,
  });
  const byTestId = await renderWithMesa(
    <FilesWorkspace project="lantern-cove" onDirtyChange={() => {}} />,
    bridge,
  );
  const rows = () => [
    ...document.querySelectorAll<HTMLButtonElement>('[aria-label="File tree"] button'),
  ];
  const buttons = () => [...(byTestId('files-workspace')[0]?.querySelectorAll('button') ?? [])];
  await click(rows()[0]);
  await act(async () => {
    const editor = byTestId('file-editor-text')[0] as HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
      editor,
      'edited a',
    );
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(buttons().find((button) => button.textContent === 'Save'));
  await click(rows()[1]);
  await click(byTestId('confirm-file-discard')[0]);
  expect(byTestId('files-workspace')[0]?.querySelector('h3[title]')?.textContent).toBe('b.md');
  await act(async () =>
    written.resolve(envelope({ path: 'a.md', revision: 'b'.repeat(64), receipt: null })),
  );
  expect(byTestId('files-workspace')[0]?.querySelector('h3[title]')?.textContent).toBe('b.md');
  expect((byTestId('file-editor-text')[0] as HTMLTextAreaElement).value).toBe('saved');
});

test('Go to file reads path:line:column as the path at that line, as terminal links do', async () => {
  const checkout = { project: 'lantern-cove', path: '/tmp/lantern-cove', registered: true };
  const { bridge, calls } = fakeBridge({
    'files tree': () => envelope({ checkout, entries: [], truncated: false }),
    'files read': () =>
      envelope({
        checkout,
        path: 'src/a.ts',
        text: 'one\n',
        revision: 'a'.repeat(64),
        lines: 2,
        targetLine: 12,
      }),
  });
  await renderWithMesa(<FilesWorkspace project="lantern-cove" onDirtyChange={() => {}} />, bridge);
  const input = document.querySelector('[aria-label="Go to file and line"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      input,
      'src/a.ts:12:5',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => input.form?.requestSubmit());
  expect(calls.filter((args) => args[1] === 'files' && args[2] === 'read')).toEqual([
    ['--json', 'files', 'read', '--line', '12', '--', 'lantern-cove', 'src/a.ts'],
  ]);
});

test('Enter in an empty filter opens nothing, since the first row may be a folder', async () => {
  const checkout = { project: 'lantern-cove', path: '/tmp/lantern-cove', registered: true };
  const { bridge, calls } = fakeBridge({
    'files tree': () =>
      envelope({
        checkout,
        entries: [
          { path: 'docs', kind: 'directory', depth: 0 },
          { path: 'docs/guide.md', kind: 'file', depth: 1 },
        ],
        truncated: false,
      }),
  });
  await renderWithMesa(<FilesWorkspace project="lantern-cove" onDirtyChange={() => {}} />, bridge);
  const input = document.querySelector('[aria-label="Go to file and line"]') as HTMLInputElement;
  await act(async () => input.form?.requestSubmit());
  expect(calls.some((args) => args[1] === 'files' && args[2] === 'read')).toBe(false);
});
