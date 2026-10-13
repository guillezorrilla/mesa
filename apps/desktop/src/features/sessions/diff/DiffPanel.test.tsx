// @vitest-environment happy-dom
import type { DiffRow } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { tally } from './DiffFileList';
import { DiffPanel } from './DiffPanel';

const meta = (left: string): DiffRow => ({ kind: 'meta', left, right: left });
const rows: DiffRow[] = [
  meta('diff --git a/src/tide.ts b/src/tide.ts'),
  meta('@@ -1,2 +1,2 @@'),
  { kind: 'context', left: 'const sea = 1;', right: 'const sea = 1;', oldLine: 1, newLine: 1 },
  { kind: 'change', left: 'low', right: 'high', oldLine: 2, newLine: 2 },
  meta('diff --git a/notes.txt b/notes.txt'),
  meta('new file mode 100644'),
  meta('@@ -0,0 +1,2 @@'),
  { kind: 'change', left: '', right: 'gull', newLine: 1 },
  { kind: 'change', left: '', right: 'kelp', newLine: 2 },
];
const diff = (data: object) => () =>
  envelope({ base: 'main', mergeBase: 'abc', ahead: 2, patch: '', rows, ...data });
const buttons = () => [...document.querySelectorAll<HTMLElement>('button')];

test('the session diff lists every changed file, walks them with j and k, and opens one in the editor', async () => {
  const { bridge, calls } = fakeBridge({
    diff: diff({}),
    'files open': () => envelope({ result: { opened: true } }),
  });
  await renderWithMesa(
    <DiffPanel
      sessionId="aaaaaaaa"
      project="lantern-cove"
      checkout="/w/reef"
      branch="session/reef"
      onClose={() => {}}
    />,
    bridge,
  );
  const panel = document.querySelector<HTMLElement>('[aria-label="Session changes"]');
  expect(panel?.textContent).toContain('session/reefsince main');
  expect(panel?.textContent).toContain('2 commits2 files+3 -1');
  const files = document.querySelectorAll('[aria-label="Changed files"] button');
  expect([...files].map((each) => each.textContent)).toEqual(['Mtide.tssrc', 'Anotes.txt']);
  expect(files[0]?.getAttribute('aria-current')).toBe('true');

  await act(async () => {
    panel?.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
  });
  expect(document.querySelector('section[aria-label="notes.txt"]')).not.toBeNull();

  await click(buttons().find((button) => button.textContent?.includes('Open in editor')));
  expect(calls).toContainEqual(
    expect.arrayContaining(['files', 'open', '--checkout', '/w/reef', '--line', '1', 'notes.txt']),
  );
});

test('a session with nothing changed says so, naming its base', async () => {
  const { bridge } = fakeBridge({ diff: diff({ rows: [], ahead: 0 }) });
  await renderWithMesa(
    <DiffPanel sessionId="aaaaaaaa" project="lantern-cove" onClose={() => {}} />,
    bridge,
  );
  expect(document.body.textContent).toContain('No changes since main');
});

test('the diffstat fills more cells for bigger changes, green for added first', () => {
  expect(tally(0, 0)).toEqual(['empty', 'empty', 'empty', 'empty', 'empty']);
  expect(tally(1, 0)).toEqual(['added', 'empty', 'empty', 'empty', 'empty']);
  expect(tally(60, 40)).toEqual(['added', 'added', 'added', 'removed', 'removed']);
});

test('dragging the edge widens the panel only as far as the terminal keeps 256px', async () => {
  localStorage.clear();
  const { bridge } = fakeBridge({ diff: diff({}) });
  await renderWithMesa(
    <div>
      <DiffPanel sessionId="aaaaaaaa" project="lantern-cove" onClose={() => {}} />
    </div>,
    bridge,
  );
  const handle = document.querySelector<HTMLElement>('[aria-label="Resize changes panel"]');
  if (!handle?.parentElement?.parentElement) throw new Error('handle missing');
  Object.defineProperty(handle.parentElement.parentElement, 'clientWidth', { value: 1100 });
  const pointer = (target: EventTarget, type: string, clientX: number) =>
    act(async () => {
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX }));
    });
  await pointer(handle, 'pointerdown', 700);
  await pointer(document, 'pointermove', 600);
  expect(handle.getAttribute('aria-valuenow')).toBe('820');
  await pointer(document, 'pointermove', 100);
  expect(handle.getAttribute('aria-valuenow')).toBe('844');
  await pointer(document, 'pointerup', 100);
});

test('Expand covers the terminal side by side, Escape shrinks it back, and left-out new files are named', async () => {
  const removal: DiffRow[] = [
    meta('diff --git a/tide.ts b/tide.ts'),
    meta('@@ -4,1 +3,0 @@'),
    { kind: 'change', left: 'gone', right: '', oldLine: 4 },
  ];
  const { bridge, calls } = fakeBridge({
    diff: diff({ rows: removal, omitted: 3 }),
    'files open': () => envelope({ result: { opened: true } }),
  });
  await renderWithMesa(
    <DiffPanel sessionId="aaaaaaaa" project="lantern-cove" onClose={() => {}} />,
    bridge,
  );
  const panel = () => document.querySelector<HTMLElement>('[aria-label="Session changes"]');
  expect(panel()?.textContent).toContain('3 more new files not shown');
  await click(buttons().find((button) => button.title === 'Expand over terminal'));
  expect(panel()?.className).toContain('absolute');
  expect(document.querySelector('[data-testid="git-side-diff"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="Resize changes panel"]')).toBeNull();
  await act(async () => {
    panel()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  expect(panel()?.className).not.toContain('absolute');
  expect(document.querySelector('[data-testid="git-inline-diff"]')).not.toBeNull();
  await click(buttons().find((button) => button.textContent?.includes('Open in editor')));
  expect(calls).toContainEqual(expect.arrayContaining(['files', 'open', '--line', '4', 'tide.ts']));
});
