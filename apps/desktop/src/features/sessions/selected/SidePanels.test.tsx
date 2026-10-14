// @vitest-environment happy-dom
import type { DiffRow } from '@mesa/core';
import { act, useState } from 'react';
import { expect, test } from 'vitest';
import type { BrowserHost } from '@/lib/platform';
import { envelope, fakeBridge, fakePlatform, managedRow, renderWithMesa } from '@/lib/testing';
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

test('a hidden Browser closes its native view, and opens it again on the same page when shown', async () => {
  const opened: string[] = [];
  const closed: string[] = [];
  let onLoad: (event: { session: string; url: string }) => void = () => {};
  const base = fakePlatform().browser;
  const browser: BrowserHost = {
    ...base,
    open: async (session, url) => {
      opened.push(url);
      onLoad({ session, url });
      return 'browser-test';
    },
    navigate: async (session, url) => onLoad({ session, url }),
    close: async (session) => {
      closed.push(session);
    },
    onLoad: async (listener) => {
      onLoad = listener;
      return () => {};
    },
  };
  const { bridge } = fakeBridge({
    'review responses': () => envelope({ rows: [], reviews: [], truncated: false }),
    'browser clear': () => envelope({ cleared: true }),
  });
  let select: (id: string) => void = () => {};
  function Screen() {
    const [selected, setSelected] = useState('aaaaaaaa');
    select = setSelected;
    return (
      <SidePanels
        rows={[managedRow('aaaaaaaa'), managedRow('bbbbbbbb')]}
        panels={{
          aaaaaaaa: { panel: 'browser', browserTarget: { url: 'https://tide.test/' } },
        }}
        selectedSession={selected}
        onClose={() => {}}
      />
    );
  }
  await renderWithMesa(<Screen />, bridge, fakePlatform({ browser }));
  expect(opened).toEqual(['https://tide.test/']);
  await act(async () => onLoad({ session: 'aaaaaaaa', url: 'https://tide.test/charts' }));

  await act(async () => select('bbbbbbbb'));
  expect(closed).toEqual(['aaaaaaaa']);
  await act(async () => select('aaaaaaaa'));
  expect(opened).toEqual(['https://tide.test/', 'https://tide.test/charts']);
});
