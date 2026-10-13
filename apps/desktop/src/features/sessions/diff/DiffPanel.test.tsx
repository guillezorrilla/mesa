// @vitest-environment happy-dom
import type { DiffRow } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { DiffPanel } from './DiffPanel';
import { tally } from './diffFiles';

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
