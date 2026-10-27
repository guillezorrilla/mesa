// @vitest-environment happy-dom
import type { DiffRow } from '@mesa/core';
import { act } from 'react';
import { beforeEach, expect, test } from 'vitest';
import {
  click,
  diffMeta,
  envelope,
  failure,
  fakeBridge,
  layoutWidth,
  pointer,
  press,
  renderWithMesa,
  sessionDiff,
} from '@/lib/testing';
import { DiffPanel } from './DiffPanel';

const diff = (data: object) => () => sessionDiff(data);
const buttons = () => [...document.querySelectorAll<HTMLElement>('button')];

beforeEach(() => localStorage.clear());

test('the session diff lists every changed file in its folder tree, walks them with j and k, and opens one in the editor', async () => {
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
  const listed = () =>
    [...document.querySelectorAll('[aria-label="Changed files"] button')].map((b) => b.textContent);
  expect(listed()).toEqual(['src', 'Mtide.ts', 'Anotes.txt']);
  expect(document.querySelector('[aria-current="true"]')?.textContent).toBe('Mtide.ts');

  await press(panel, 'j');
  expect(document.querySelector('section[aria-label="notes.txt"]')).not.toBeNull();
  /** The open file's section, whose header counts it: `2 / 2`. */
  const counter = () =>
    document.querySelector('[aria-label="Session changes"] section')?.textContent ?? '';
  expect(counter()).toContain('2 / 2');
  // A folder closes, the open file's too; k into a closed one opens it, in the tree's order.
  await click(buttons().find((button) => button.textContent === 'src'));
  expect(listed()).toEqual(['src', 'Anotes.txt']);
  await press(panel, 'k');
  expect(listed()).toEqual(['src', 'Mtide.ts', 'Anotes.txt']);
  expect(counter()).toContain('1 / 2');
  await click(buttons().find((button) => button.textContent === 'src'));
  expect(listed()).toEqual(['src', 'Anotes.txt']);
  await press(panel, 'j');
  // The flat list puts each folder under its name, and is kept.
  await click(buttons().find((button) => button.getAttribute('aria-label') === 'Flat file list'));
  expect(listed()).toEqual(['Mtide.tssrc/', 'Anotes.txt']);
  expect(localStorage.getItem('mesa.diff.files')).toBe('list');

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
  layoutWidth(handle.parentElement.parentElement, 1100);
  await pointer(handle, 'pointerdown', { clientX: 700 });
  await pointer(document, 'pointermove', { clientX: 600 });
  expect(handle.getAttribute('aria-valuenow')).toBe('820');
  await pointer(document, 'pointermove', { clientX: 100 });
  expect(handle.getAttribute('aria-valuenow')).toBe('844');
  await pointer(document, 'pointerup', { clientX: 100 });
});

test("the file list's edge widens it as far as the diff keeps 240px, kept, and an expanded panel starts it wider", async () => {
  const { bridge } = fakeBridge({ diff: diff({}) });
  const panel = () => (
    <DiffPanel
      sessionId="aaaaaaaa"
      project="lantern-cove"
      checkout="/w/reef"
      state="idle"
      onClose={() => {}}
    />
  );
  await renderWithMesa(panel(), bridge);
  const handle = () => document.querySelector<HTMLElement>('[aria-label="Resize file list"]');
  const list = () => handle()?.parentElement;
  expect(handle()?.getAttribute('aria-valuenow')).toBe('224');
  await pointer(handle() as HTMLElement, 'pointerdown', { clientX: 300 });
  await pointer(document, 'pointermove', { clientX: 420 });
  await pointer(document, 'pointerup', { clientX: 420 });
  expect(list()?.style.width).toBe('344px');
  expect(localStorage.getItem('mesa.diff.list.width')).toBe('344');
  // With 600px for list and diff, a drag stops at 360: the diff keeps 240px, and the edge the pointer.
  layoutWidth(list()?.parentElement, 600);
  await pointer(handle() as HTMLElement, 'pointerdown', { clientX: 400 });
  await pointer(document, 'pointermove', { clientX: 900 });
  expect(handle()?.getAttribute('aria-valuenow')).toBe('360');
  await pointer(document, 'pointerup', { clientX: 900 });
  // A new render, as the next diff opened, reads the kept width.
  await renderWithMesa(panel(), bridge);
  expect(handle()?.getAttribute('aria-valuenow')).toBe('360');
  await act(async () => {
    handle()?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
  expect(handle()?.getAttribute('aria-valuenow')).toBe('224');

  // Nothing kept: the expanded panel's list starts at 288px.
  localStorage.clear();
  await renderWithMesa(panel(), bridge);
  await click(
    buttons().find((button) => button.getAttribute('aria-label') === 'Expand over terminal'),
  );
  expect(handle()?.getAttribute('aria-valuenow')).toBe('288');
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
  await press(panel(), 'Escape');
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
