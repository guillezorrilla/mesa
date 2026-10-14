// @vitest-environment happy-dom
import { act, useState } from 'react';
import { expect, test } from 'vitest';
import type { BrowserHost } from '@/lib/platform';
import {
  click,
  envelope,
  fakeBridge,
  fakePlatform,
  managedRow,
  renderWithMesa,
  sessionDiff,
} from '@/lib/testing';
import { SidePanels } from './SidePanels';
import type { OpenPanel } from './useSidePanel';

test("a session's panel stays as it was while another session is selected", async () => {
  const { bridge, calls } = fakeBridge({ diff: () => sessionDiff() });
  const reads = () => calls.filter((argv) => argv[1] === 'diff').length;
  let select: (id: string) => void = () => {};
  let settle: () => void = () => {};
  function Screen() {
    const [selected, setSelected] = useState('aaaaaaaa');
    const [idle, setIdle] = useState(false);
    select = setSelected;
    settle = () => setIdle(true);
    const state = { state: idle ? 'idle' : 'working', confidence: 1, at: 'x', source: 'hook' };
    return (
      <SidePanels
        rows={[managedRow('aaaaaaaa', { lastState: state } as never), managedRow('bbbbbbbb')]}
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
  expect(reads()).toBe(1);

  await act(async () => select('bbbbbbbb'));
  expect(panel()?.checkVisibility()).toBe(false);
  // Its session finishes its turn while hidden.
  await act(async () => settle());

  await act(async () => select('aaaaaaaa'));
  expect(panel()?.checkVisibility()).toBe(true);
  // The same panel, still on the file it had open: it was hidden, never closed.
  expect(document.querySelector('section[aria-label="notes.txt"]')).toBe(opened);
  // Shown again, it reads its changes once: the missed state needs no read of its own.
  expect(reads()).toBe(2);
});

test('a hidden Browser hides its native view and shows it again as it was; closing it closes the view', async () => {
  // Each native view call, in order: what it did and to which session or URL.
  const log: string[] = [];
  let onLoad: (event: { session: string; url: string }) => void = () => {};
  const base = fakePlatform().browser;
  const browser: BrowserHost = {
    ...base,
    open: async (session, url) => {
      log.push(`open ${url}`);
      onLoad({ session, url });
      return 'browser-test';
    },
    navigate: async (session, url) => onLoad({ session, url }),
    hide: async (session) => void log.push(`hide ${session}`),
    show: async (session) => void log.push(`show ${session}`),
    close: async (session) => void log.push(`close ${session}`),
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
    const [panels, setPanels] = useState<Record<string, OpenPanel | undefined>>({
      aaaaaaaa: { panel: 'browser', browserTarget: { url: 'https://tide.test/' } },
    });
    select = setSelected;
    return (
      <SidePanels
        rows={[managedRow('aaaaaaaa'), managedRow('bbbbbbbb')]}
        panels={panels}
        selectedSession={selected}
        onClose={(session) => setPanels((all) => ({ ...all, [session]: undefined }))}
      />
    );
  }
  await renderWithMesa(<Screen />, bridge, fakePlatform({ browser }));
  expect(log.filter((call) => call.startsWith('open'))).toEqual(['open https://tide.test/']);
  await act(async () => onLoad({ session: 'aaaaaaaa', url: 'https://tide.test/charts' }));

  let mark = log.length;
  await act(async () => select('bbbbbbbb'));
  expect(log.slice(mark)).toEqual(['hide aaaaaaaa']);

  mark = log.length;
  await act(async () => select('aaaaaaaa'));
  // The same view comes back: shown, never opened again on the last page.
  expect(log.slice(mark)).toEqual(['show aaaaaaaa']);

  mark = log.length;
  await click(document.querySelector<HTMLElement>('[aria-label="Close browser"]') ?? undefined);
  expect(document.querySelector('[aria-label="Session browser"]')).toBeNull();
  expect(log.slice(mark)).toEqual(['hide aaaaaaaa', 'close aaaaaaaa']);
});
