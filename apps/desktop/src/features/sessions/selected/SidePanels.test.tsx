// @vitest-environment happy-dom
import type { DiffRow } from '@mesa/core';
import { act, useState } from 'react';
import { expect, test } from 'vitest';
import { envelope, fakeBridge, managedRow, renderWithMesa } from '@/lib/testing';
import { SidePanels } from './SidePanels';

const meta = (left: string): DiffRow => ({ kind: 'meta', left, right: left });
const rows: DiffRow[] = [
  meta('diff --git a/src/tide.ts b/src/tide.ts'),
  meta('@@ -1 +1 @@'),
  { kind: 'change', left: 'low', right: 'high', oldLine: 1, newLine: 1 },
  meta('diff --git a/notes.txt b/notes.txt'),
  meta('@@ -0,0 +1 @@'),
  { kind: 'change', left: '', right: 'gull', newLine: 1 },
];

test("a session's panel stays as it was while another session is selected", async () => {
  const { bridge } = fakeBridge({
    diff: () =>
      envelope({
        checkout: { project: 'lantern-cove', path: '/w/reef', registered: false },
        base: 'main',
        mergeBase: 'abc',
        ahead: 1,
        omitted: 0,
        rows,
      }),
  });
  let select: (id: string) => void = () => {};
  function Screen() {
    const [selected, setSelected] = useState('aaaaaaaa');
    select = setSelected;
    return (
      <SidePanels
        rows={[managedRow('aaaaaaaa'), managedRow('bbbbbbbb')]}
        panels={{ aaaaaaaa: { panel: 'diff' } }}
        selectedSession={selected}
        onClose={() => {}}
      />
    );
  }
  await renderWithMesa(<Screen />, bridge);
  const panel = () => document.querySelector<HTMLElement>('[aria-label="Session changes"]');
  await act(async () => {
    panel()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
  });
  const opened = document.querySelector('section[aria-label="notes.txt"]');
  expect(opened).not.toBeNull();

  await act(async () => select('bbbbbbbb'));
  expect(panel()?.checkVisibility()).toBe(false);

  await act(async () => select('aaaaaaaa'));
  expect(panel()?.checkVisibility()).toBe(true);
  // The same panel, still on the file it had open: it was hidden, never closed.
  expect(document.querySelector('section[aria-label="notes.txt"]')).toBe(opened);
});
