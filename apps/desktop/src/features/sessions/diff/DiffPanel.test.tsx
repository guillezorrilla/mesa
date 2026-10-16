// @vitest-environment happy-dom
import type { DiffRow } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import {
  click,
  diffMeta,
  envelope,
  failure,
  fakeBridge,
  pointer,
  renderWithMesa,
  sessionDiff,
} from '@/lib/testing';
import { DiffPanel } from './DiffPanel';

const diff = (data: object) => () => sessionDiff(data);
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
      state="idle"
      onClose={() => {}}
    />,
    bridge,
  );
  const panel = document.querySelector<HTMLElement>('[aria-label="Session changes"]');
  expect(panel?.textContent).toContain('session/reefsince main');
  expect(panel?.textContent).toContain('2 commits2 files+3 -1');
  const files = document.querySelectorAll('[aria-label="Changed files"] button');
  expect([...files].map((each) => each.textContent)).toEqual(['Mtide.tssrc/', 'Anotes.txt']);
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
    <DiffPanel
      sessionId="aaaaaaaa"
      project="lantern-cove"
      checkout="/w/reef"
      state="idle"
      onClose={() => {}}
    />,
    bridge,
  );
  expect(document.body.textContent).toContain('No changes since main');
});

test('dragging the edge widens the panel only as far as the terminal keeps 256px', async () => {
  localStorage.clear();
  const { bridge } = fakeBridge({ diff: diff({}) });
  await renderWithMesa(
    <div>
      <DiffPanel
        sessionId="aaaaaaaa"
        project="lantern-cove"
        checkout="/w/reef"
        state="idle"
        onClose={() => {}}
      />
    </div>,
    bridge,
  );
  const handle = document.querySelector<HTMLElement>('[aria-label="Resize changes panel"]');
  if (!handle?.parentElement?.parentElement) throw new Error('handle missing');
  Object.defineProperty(handle.parentElement.parentElement, 'clientWidth', { value: 1100 });
  await pointer(handle, 'pointerdown', { clientX: 700 });
  await pointer(document, 'pointermove', { clientX: 600 });
  expect(handle.getAttribute('aria-valuenow')).toBe('820');
  await pointer(document, 'pointermove', { clientX: 100 });
  expect(handle.getAttribute('aria-valuenow')).toBe('844');
  await pointer(document, 'pointerup', { clientX: 100 });
});

test('Expand covers the terminal side by side, Escape shrinks it back, and left-out new files are named', async () => {
  const removal: DiffRow[] = [
    diffMeta('diff --git a/tide.ts b/tide.ts'),
    diffMeta('@@ -4,1 +3,0 @@'),
    { kind: 'change', left: 'gone', right: '', oldLine: 4 },
  ];
  const { bridge, calls } = fakeBridge({
    diff: diff({ rows: removal, omitted: 3 }),
    'files open': () => envelope({ result: { opened: true } }),
  });
  await renderWithMesa(
    <DiffPanel
      sessionId="aaaaaaaa"
      project="lantern-cove"
      checkout="/w/reef"
      state="idle"
      onClose={() => {}}
    />,
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

test("picking a branch to compare with reads the session's changes against it", async () => {
  const { bridge, calls } = fakeBridge({
    diff: (args) => {
      const at = args.indexOf('--base');
      if (at < 0) return sessionDiff({ base: 'origin/main' });
      const base = args[at + 1] ?? '';
      return base === 'origin/trunk'
        ? failure('base branch origin/trunk is not in this checkout', 'usage')
        : sessionDiff({ base });
    },
    'git branches': () =>
      envelope({
        checkout: { project: 'lantern-cove', path: '/w/reef', registered: false },
        branches: [{ name: 'session/reef', oid: 'b', current: true }],
        // origin/develop has no local branch tracking it: listed all the same.
        remotes: ['origin/develop', 'origin/main', 'origin/trunk'],
      }),
  });
  await renderWithMesa(
    <DiffPanel
      sessionId="aaaaaaaa"
      project="lantern-cove"
      checkout="/w/reef"
      state="idle"
      onClose={() => {}}
    />,
    bridge,
  );
  const picker = (base: string) =>
    document.querySelector<HTMLElement>(`[aria-label="Compare with ${base}"]`) ?? undefined;
  const item = (name: string) =>
    [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].find((i) => i.textContent === name);
  // The branches are read only once the menu opens.
  const listed = () => calls.filter((argv) => argv[1] === 'git' && argv[2] === 'branches').length;
  expect(listed()).toBe(0);
  await click(picker('origin/main'));
  expect(listed()).toBe(1);
  expect(item('session/reef')).toBeDefined();
  await click(item('origin/develop'));
  expect(calls).toContainEqual(expect.arrayContaining(['diff', '--base', 'origin/develop']));
  expect(document.body.textContent).toContain('since origin/develop');

  // A base that fails to read keeps the picker, so another can be picked.
  await click(picker('origin/develop'));
  await click(item('origin/trunk'));
  expect(picker('origin/trunk')).toBeDefined();
});

test("the header names the branch the diff read, ahead of the board's, as a move lags there", async () => {
  const { bridge } = fakeBridge({ diff: diff({ branch: 'feat/kelp' }) });
  await renderWithMesa(
    <DiffPanel
      sessionId="aaaaaaaa"
      project="lantern-cove"
      checkout="/w/kelp"
      branch="main"
      state="idle"
      onClose={() => {}}
    />,
    bridge,
  );
  const panel = document.querySelector<HTMLElement>('[aria-label="Session changes"]');
  expect(panel?.textContent).toContain('feat/kelpsince main');
});
