// @vitest-environment happy-dom
import type { DiffRow } from '@mesa/core';
import { act } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  asking,
  click,
  diffMeta,
  envelope,
  failure,
  fakeBridge,
  fill,
  layoutWidth,
  managedRow,
  pointer,
  press,
  renderWithMesa,
  sessionDiff,
  toastTexts,
} from '@/lib/testing';
import { DiffPanel } from './DiffPanel';

const diff = (data: object) => () => sessionDiff(data);
const buttons = () => [...document.querySelectorAll<HTMLElement>('button')];

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

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

/** A notes store behind the fake bridge: add, list and send as the CLI answers them. */
function notesBridge(rows: object[] = []) {
  const notes: Record<string, unknown>[] = [];
  const flag = (args: string[], name: string) =>
    args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  return fakeBridge({
    diff: diff({}),
    sessions: () => envelope(rows),
    'review notes': () => envelope(structuredClone(notes)),
    'review notes add': (args) => {
      const line = Number(flag(args, 'line'));
      const note = {
        id: `note${notes.length + 1}`,
        path: flag(args, 'path'),
        line,
        end: Number(flag(args, 'end') ?? line),
        scope: 'branch',
        text: flag(args, 'text'),
        quoted: '',
        blob: 'b',
        at: '2026-11-10T12:00:00.000Z',
        stale: false,
      };
      notes.push(note);
      return envelope(note);
    },
    'review notes send': (args) => {
      const to = flag(args, 'to') ?? 'aaaaaaaa';
      const sent = notes.filter((n) => !n.sentAt).map((n) => n.id);
      for (const n of notes) Object.assign(n, { sentAt: '2026-11-10T12:01:00.000Z', sentTo: to });
      return envelope({
        to,
        sent,
        stale: [],
        delivery: { id: 'x', target: to, status: 'delivered' },
      });
    },
  });
}

test('a note goes on a line with its +, on a range with a drag, and both go in one send that marks them Sent', async () => {
  const { bridge, calls } = notesBridge();
  const byTestId = await renderWithMesa(
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
  const plus = (n: number) =>
    document.querySelector<HTMLElement>(`[aria-label="Add note on line ${n}"]`);
  const field = (label: string) =>
    document.querySelector<HTMLTextAreaElement>(`textarea[aria-label="Note on ${label}"]`);
  const card = (label: string) =>
    document.querySelector<HTMLElement>(`article[aria-label="Note on ${label}"]`);

  await click(plus(2) ?? undefined);

  await fill(field('line 2'), 'say high tide');
  await press(field('line 2'), 'Enter', { metaKey: true });
  expect(calls).toContainEqual(
    expect.arrayContaining([
      'notes',
      'add',
      '--path=src/tide.ts',
      '--line=2',
      '--end=2',
      '--text=say high tide',
    ]),
  );
  expect(card('line 2')?.textContent).toContain('say high tide');

  // A drag from line 1's + over line 2 writes on both.
  await pointer(plus(1) as HTMLElement, 'pointerdown');
  await pointer(plus(2)?.parentElement as HTMLElement, 'pointerover');
  await pointer(window, 'pointerup');
  await fill(field('lines 1-2'), 'one constant');
  await click(buttons().find((b) => b.textContent?.startsWith('Save')));
  expect(calls).toContainEqual(
    expect.arrayContaining(['--line=1', '--end=2', '--text=one constant']),
  );
  expect(card('lines 1-2')?.textContent).toContain('one constant');

  const send = buttons().find((b) => b.textContent?.trim() === 'Send notes (2)');
  await click(send);
  expect(calls).toContainEqual(expect.arrayContaining(['notes', 'send', '--no-from', 'aaaaaaaa']));
  expect(toastTexts(byTestId)).toContain('Sent 2 notes to aaaaaaaa');
  expect(card('line 2')?.textContent).toContain('Sent');
  expect(card('lines 1-2')?.textContent).toContain('Sent');
  expect(buttons().find((b) => b.textContent?.trim() === 'Send notes (0)')).toHaveProperty(
    'disabled',
    true,
  );
});

test('Esc closes a note being written, and Add file note writes one on the whole file', async () => {
  const { bridge, calls } = notesBridge();
  await renderWithMesa(
    <DiffPanel sessionId="aaaaaaaa" project="lantern-cove" state="idle" onClose={() => {}} />,
    bridge,
  );
  await click(
    document.querySelector<HTMLElement>('[aria-label="Add note on line 1"]') ?? undefined,
  );
  const box = () => document.querySelector<HTMLTextAreaElement>('textarea');
  await press(box(), 'Escape');
  expect(box()).toBeNull();
  await click(document.querySelector<HTMLElement>('[aria-label="Add file note"]') ?? undefined);
  await fill(box(), 'split this file');
  await press(box(), 'Enter', { metaKey: true });
  expect(calls).toContainEqual(expect.arrayContaining(['--line=0', '--text=split this file']));
  expect(calls.flat()).not.toContain('--end=0');
  expect(document.querySelector('article[aria-label="Note on file"]')?.textContent).toContain(
    'split this file',
  );
});

test('the Notes list groups notes by file, unsent before sent; a click jumps to one; Resolve hides a changed one', async () => {
  const note = (id: string, path: string, line: number, extra: object = {}) => ({
    id,
    path,
    line,
    end: line,
    scope: 'branch',
    text: `about ${id}`,
    quoted: '',
    blob: 'b',
    at: '2026-11-10T12:00:00.000Z',
    stale: false,
    ...extra,
  });
  let notes = [
    note('sent0001', 'src/tide.ts', 2, { sentAt: '2026-11-10T12:01:00.000Z' }),
    note('draft001', 'src/tide.ts', 1),
    note('moved001', 'notes.txt', 1, { sentAt: '2026-11-10T12:01:00.000Z', stale: true }),
  ];
  const { bridge, calls } = fakeBridge({
    diff: diff({}),
    'review notes': () => envelope(structuredClone(notes)),
    'review notes resolve': (args) => {
      notes = notes.filter((n) => n.id !== args.at(-1));
      return envelope({ id: args.at(-1) });
    },
  });
  const scroll = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
  await renderWithMesa(
    <DiffPanel sessionId="aaaaaaaa" project="lantern-cove" state="idle" onClose={() => {}} />,
    bridge,
  );
  const list = () => document.querySelector<HTMLElement>('aside[aria-label="Notes"]');
  const groups = () =>
    [...(list()?.querySelectorAll('section') ?? [])].map((section) => [
      section.getAttribute('aria-label'),
      ...[...section.querySelectorAll('button')].map((b) => b.textContent),
    ]);
  expect(groups()).toEqual([
    ['notes.txt', 'Line 1Changed since sentabout moved001'],
    ['src/tide.ts', 'Line 1Unsentabout draft001', 'Line 2Sentabout sent0001'],
  ]);

  await click(
    [...(list()?.querySelectorAll('button') ?? [])].find((b) =>
      b.textContent?.includes('moved001'),
    ),
  );
  expect(document.querySelector('section[aria-label="notes.txt"] article')).not.toBeNull();
  expect(scroll.mock.contexts.map((el) => (el as Element).id)).toEqual(['note-moved001']);

  const card = document.getElementById('note-moved001');
  expect(card?.textContent).toContain('Changed since sent');
  await click(card?.querySelector<HTMLElement>('[aria-label="Resolve note"]') ?? undefined);
  expect(calls).toContainEqual(expect.arrayContaining(['resolve', 'aaaaaaaa', 'moved001']));
  expect(document.getElementById('note-moved001')).toBeNull();
  expect(groups().map((g) => g[0])).toEqual(['src/tide.ts']);
});

const menuItems = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
const openSendMenu = () =>
  click(document.querySelector<HTMLElement>('[aria-label="More ways to send notes"]') ?? undefined);

test("Send notes' menu lists this session, the live ones in its checkout and its kin, and sends to the one picked", async () => {
  const tree = { path: '/w/reef', branch: 'session/reef' };
  const rows = [
    managedRow('aaaaaaaa', { name: 'Reef', worktree: tree, children: ['cccccccc'] }),
    managedRow('bbbbbbbb', { name: 'Fresh eyes', worktree: tree }),
    managedRow('cccccccc', { name: 'Kelp worker', worktree: { path: '/w/kelp', branch: 'k' } }),
    managedRow('dddddddd', { name: 'Elsewhere', worktree: { path: '/w/dune', branch: 'd' } }),
    managedRow('eeeeeeee', {
      name: 'Asking',
      worktree: tree,
      lastState: { ...asking.lastState, state: 'waiting-question' },
    }),
    managedRow('ffffffff', { name: 'Gone', worktree: tree, alive: false }),
  ];
  const { bridge, calls } = notesBridge(rows);
  const byTestId = await renderWithMesa(
    <DiffPanel sessionId="aaaaaaaa" project="lantern-cove" state="idle" onClose={() => {}} />,
    bridge,
  );
  await click(
    document.querySelector<HTMLElement>('[aria-label="Add note on line 1"]') ?? undefined,
  );
  const box = () => document.querySelector<HTMLTextAreaElement>('textarea');
  await fill(box(), 'check the tide');
  await press(box(), 'Enter', { metaKey: true });

  await openSendMenu();
  expect(menuItems().map((item) => item.textContent?.trim())).toEqual([
    'This session (Reef)',
    'Fresh eyes',
    'Kelp worker',
    'AskingWaiting on a question',
    'New agent here',
    "Send this file's notes (1)",
  ]);
  const item = (text: string) => menuItems().find((i) => i.textContent?.startsWith(text));
  expect(item('Asking')?.getAttribute('aria-disabled')).toBe('true');
  await click(item('Fresh eyes'));
  expect(calls).toContainEqual(
    expect.arrayContaining(['notes', 'send', '--to=bbbbbbbb', 'aaaaaaaa']),
  );
  expect(toastTexts(byTestId)).toContain('Sent 1 note to Fresh eyes');
  expect(document.querySelector('article[aria-label="Note on line 1"]')?.textContent).toContain(
    'Sent to Fresh eyes',
  );
  expect(document.querySelector('aside[aria-label="Notes"]')?.textContent).toContain(
    'Sent to Fresh eyes',
  );
});

test('New agent here starts a session with the notes', async () => {
  const { bridge, calls } = notesBridge();
  await renderWithMesa(
    <DiffPanel sessionId="aaaaaaaa" project="lantern-cove" state="idle" onClose={() => {}} />,
    bridge,
  );
  await click(
    document.querySelector<HTMLElement>('[aria-label="Add note on line 1"]') ?? undefined,
  );
  const box = () => document.querySelector<HTMLTextAreaElement>('textarea');
  await fill(box(), 'review this');
  await press(box(), 'Enter', { metaKey: true });
  await openSendMenu();
  // Before the board has read the session, it is still the first place its notes go.
  expect(menuItems()[0]?.textContent).toBe('This session (aaaaaaaa)');
  await click(menuItems().find((i) => i.textContent?.trim() === 'New agent here'));
  expect(calls).toContainEqual(expect.arrayContaining(['notes', 'send', '--to=new', 'aaaaaaaa']));
});

test('c on a focused line opens the note composer there, Shift+arrows on a range, and not in a text field', async () => {
  const { bridge } = notesBridge();
  await renderWithMesa(
    <DiffPanel sessionId="aaaaaaaa" project="lantern-cove" state="idle" onClose={() => {}} />,
    bridge,
  );
  const plus = (n: number) =>
    document.querySelector<HTMLElement>(`[aria-label="Add note on line ${n}"]`);
  const fields = () => [...document.querySelectorAll<HTMLTextAreaElement>('textarea')];
  await press(plus(2), 'c');
  expect(fields().map((f) => f.getAttribute('aria-label'))).toEqual(['Note on line 2']);
  // Typing c in the composer types it; no second composer opens.
  await press(fields()[0], 'c');
  expect(fields()).toHaveLength(1);
  await press(fields()[0], 'Escape');

  await act(async () => plus(1)?.focus());
  await press(plus(1), 'ArrowDown', { shiftKey: true });
  expect(document.activeElement).toBe(plus(2));
  await press(plus(2), 'c');
  expect(fields().map((f) => f.getAttribute('aria-label'))).toEqual(['Note on lines 1-2']);
});
