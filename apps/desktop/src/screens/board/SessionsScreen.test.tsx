// @vitest-environment happy-dom
import type { TreeRow } from '@mesa/core';
import { act } from 'react';
import { expect, test, vi } from 'vitest';
import { App } from '@/App';
import {
  asking,
  busy,
  choose,
  click,
  deferred,
  envelope,
  exited,
  failure,
  fakeBridge,
  fakePlatform,
  guardrailStopped,
  managedRow,
  PROJECTS,
  renderWithMesa,
  toasts,
  toastTexts,
} from '@/lib/testing';

const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) => element.textContent?.trim() === label,
  );
async function renderSession(...args: Parameters<typeof renderWithMesa>) {
  const byTestId = await renderWithMesa(...args);
  await click(document.querySelector<HTMLElement>('[aria-label="Session actions"]') ?? undefined);
  return byTestId;
}

test('New session opens a dialog, and Open starts the picked project with the picked agent', async () => {
  const { bridge, calls } = fakeBridge({
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    projects: () => envelope(PROJECTS),
    open: () => envelope({ ...busy, id: 'dddddddd' }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(document.querySelector<HTMLElement>('[aria-label="New session"]') ?? undefined);
  await click(
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === 'lantern-cove',
    ),
  );
  const dialog = byTestId('new-session-dialog')[0];
  // A Radix dialog: open is its data-state, not the native open attribute.
  expect(dialog?.dataset.state).toBe('open');
  const options = [...(byTestId('new-session-project')[0] as HTMLSelectElement).options];
  expect(options.map((o) => [o.value, o.disabled])).toEqual([
    ['lantern-cove', false],
    // Its folder is gone: it cannot start a session.
    ['tide', true],
  ]);
  // Every agent Mesa runs, Claude Code first, as core lists them.
  const agents = [...(dialog?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [])];
  expect(agents.map((a) => [a.value, a.disabled, a.getAttribute('aria-checked')])).toEqual([
    ['claude', false, 'true'],
    ['codex', false, 'false'],
    ['antigravity', false, 'false'],
  ]);
  expect(dialog?.textContent).toContain('Codex');
  await click(agents[1]);
  await click(byTestId('new-session-submit')[0]);
  expect(calls).toContainEqual([
    '--json',
    'open',
    '--no-parent',
    '--agent',
    'codex',
    '--',
    'lantern-cove',
  ]);
  expect(byTestId('new-session-dialog')).toHaveLength(0);
  expect(byTestId('toast')[0]?.textContent).toContain('Opened session dddddddd on lantern-cove');
});

test('New session starts Claude Code in native Plan mode when selected', async () => {
  const { bridge, calls } = fakeBridge({
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    projects: () => envelope(PROJECTS),
    open: () => envelope({ ...busy, id: 'dddddddd' }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(document.querySelector<HTMLElement>('[aria-label="New session"]') ?? undefined);
  await click(
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === 'lantern-cove',
    ),
  );
  await choose(byTestId('session-mode')[0], 'plan');
  await click(byTestId('session-background')[0]);
  await click(byTestId('new-session-submit')[0]);
  expect(calls).toContainEqual([
    '--json',
    'open',
    '--no-parent',
    '--agent',
    'claude',
    '--mode',
    'plan',
    '--background',
    '--',
    'lantern-cove',
  ]);
});

test('New session loads its row before switching to the terminal', async () => {
  const opened = managedRow('newnewnew');
  let rows = [busy];
  const { bridge } = fakeBridge({
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    projects: () => envelope(PROJECTS),
    sessions: () => envelope(rows),
    open: () => {
      rows = [busy, opened];
      return envelope(opened);
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(document.querySelector<HTMLElement>('[aria-label="New session"]') ?? undefined);
  await click(
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === 'lantern-cove',
    ),
  );
  await click(byTestId('new-session-submit')[0]);
  expect(byTestId('selected-session')).toHaveLength(1);
  expect(byTestId('terminal-newnewnew')).toHaveLength(1);
  expect(document.body.textContent).not.toContain('Session unavailable');
});

test('New session passes a multi-line goal with --goal; a blank one passes none', async () => {
  const { bridge, calls } = fakeBridge({
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    projects: () => envelope(PROJECTS),
    open: () => envelope({ ...busy, id: 'dddddddd' }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(document.querySelector<HTMLElement>('[aria-label="New session"]') ?? undefined);
  await click(
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === 'lantern-cove',
    ),
  );
  const goal = byTestId('new-session-goal')[0] as HTMLTextAreaElement;
  expect(goal.tagName).toBe('TEXTAREA');
  goal.value = '/goal Print "ready"\nthen stop';
  await click(byTestId('new-session-submit')[0]);
  expect(calls).toContainEqual([
    '--json',
    'open',
    '--no-parent',
    '--agent',
    'claude',
    '--goal=/goal Print "ready"\nthen stop',
    '--',
    'lantern-cove',
  ]);

  expect(byTestId('selected-session')).toHaveLength(1);
  const menu = document.querySelector('[aria-label="New session"]') as HTMLElement;
  await click(menu);
  await click(
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (button) => button.textContent === 'lantern-cove',
    ),
  );
  (byTestId('new-session-goal')[0] as HTMLTextAreaElement).value = ' \n ';
  await click(byTestId('new-session-submit')[0]);
  expect(calls.filter((c) => c[1] === 'open').at(-1)).toEqual([
    '--json',
    'open',
    '--no-parent',
    '--agent',
    'claude',
    '--',
    'lantern-cove',
  ]);
});

test('New session passes a branch with --branch, trimmed; a blank one passes none', async () => {
  const { bridge, calls } = fakeBridge({
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    projects: () => envelope(PROJECTS),
    open: () => envelope({ ...busy, id: 'dddddddd' }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(document.querySelector<HTMLElement>('[aria-label="New session"]') ?? undefined);
  await click(
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === 'lantern-cove',
    ),
  );
  (byTestId('new-session-branch')[0] as HTMLInputElement).value = ' try/worktree ';
  await click(byTestId('new-session-submit')[0]);
  expect(calls).toContainEqual([
    '--json',
    'open',
    '--no-parent',
    '--agent',
    'claude',
    '--branch=try/worktree',
    '--',
    'lantern-cove',
  ]);

  expect(byTestId('selected-session')).toHaveLength(1);
  const menu = document.querySelector('[aria-label="New session"]') as HTMLElement;
  await click(menu);
  await click(
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (button) => button.textContent === 'lantern-cove',
    ),
  );
  (byTestId('new-session-branch')[0] as HTMLInputElement).value = '  ';
  await click(byTestId('new-session-submit')[0]);
  expect(calls.filter((c) => c[1] === 'open').at(-1)).not.toContainEqual(
    expect.stringMatching(/^--branch/),
  );
});

test('a send typed with a warning says so in the toast, so it is not sent again', async () => {
  const { bridge } = fakeBridge({
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    sessions: () => envelope([managedRow('aaaaaaaa')]),
    send: () =>
      envelope({
        sent: true,
        session: 'aaaaaaaa',
        from: null,
        chars: 5,
        warning: 'the prompt was typed, but no send event on aaaaaaaa (x); do not send it again',
      }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(document.querySelector<HTMLElement>('[aria-label="Session actions"]') ?? undefined);
  (document.querySelector('[aria-label="Prompt for aaaaaaaa"]') as HTMLInputElement).value =
    'hello';
  await act(async () =>
    document
      .querySelector('[aria-label="Prompt for aaaaaaaa"]')
      ?.closest('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(byTestId('toast')[0]?.textContent).toContain('do not send it again');
});

test("the guardrail's ask opens a dialog with its reason and decision; Send anyway sends with --yes", async () => {
  const { bridge, calls } = fakeBridge({
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    sessions: () => envelope([managedRow('aaaaaaaa')]),
    send: (args) =>
      args.includes('--yes')
        ? envelope({ sent: true, session: 'aaaaaaaa', from: null, chars: 5, override: 'yes' })
        : guardrailStopped('ask', 'project lantern-cove has guardrail: strict'),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(document.querySelector<HTMLElement>('[aria-label="Session actions"]') ?? undefined);
  const box = () =>
    document.querySelector('[aria-label="Prompt for aaaaaaaa"]') as HTMLInputElement;
  box().value = 'hello';
  await act(async () =>
    document
      .querySelector('[aria-label="Prompt for aaaaaaaa"]')
      ?.closest('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(byTestId('guardrail-dialog')[0]?.textContent).toContain(
    'Project lantern-cove has guardrail: strict.',
  );
  expect(
    [...(byTestId('guardrail-decision')[0]?.querySelectorAll('dd') ?? [])].map(
      (d) => d.textContent,
    ),
  ).toEqual(['ask, 95% sure', '5%', 'rules']);
  expect(byTestId('toast')).toEqual([]);

  // Cancel keeps the prompt, unsent.
  const buttons = byTestId('guardrail-dialog')[0]?.querySelectorAll('button') ?? [];
  await click([...buttons].find((b) => b.textContent === 'Cancel'));
  expect(byTestId('guardrail-dialog')).toEqual([]);
  expect(box().value).toBe('hello');

  await act(async () =>
    document
      .querySelector('[aria-label="Prompt for aaaaaaaa"]')
      ?.closest('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  await click(byTestId('guardrail-send')[0]);
  expect(calls.filter((c) => c[1] === 'send')).toEqual([
    ['--json', 'send', '--no-from', '--', 'aaaaaaaa', 'hello'],
    ['--json', 'send', '--no-from', '--', 'aaaaaaaa', 'hello'],
    ['--json', 'send', '--no-from', '--yes', '--', 'aaaaaaaa', 'hello'],
  ]);
  expect(byTestId('guardrail-dialog')).toEqual([]);
  expect(box().value).toBe('');
  expect(toastTexts(byTestId)).toEqual(['Sent 5 characters to aaaaaaaa']);
});

test("the guardrail's block is said in the toast, with no way past it in the app", async () => {
  const { bridge, calls } = fakeBridge({
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    sessions: () => envelope([managedRow('aaaaaaaa')]),
    send: () => guardrailStopped('block', 'the text holds a destructive command (rm -rf)'),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(document.querySelector<HTMLElement>('[aria-label="Session actions"]') ?? undefined);
  (document.querySelector('[aria-label="Prompt for aaaaaaaa"]') as HTMLInputElement).value =
    'run rm -rf /';
  await act(async () =>
    document
      .querySelector('[aria-label="Prompt for aaaaaaaa"]')
      ?.closest('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(byTestId('guardrail-dialog')).toEqual([]);
  expect(toasts(byTestId)).toEqual([
    ['alert', 'Not sent to aaaaaaaa: the text holds a destructive command (rm -rf)'],
  ]);
  expect(calls.filter((c) => c[1] === 'send')).toHaveLength(1);
  expect(
    (document.querySelector('[aria-label="Prompt for aaaaaaaa"]') as HTMLInputElement).value,
  ).toBe('run rm -rf /');
});

test('skills launch in the terminal, and historical receipts have no primary app page', async () => {
  const { bridge } = fakeBridge({ sessions: () => envelope([asking]) });
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(byTestId('run-skill')).toHaveLength(0);
  expect(byTestId('nav-receipts')).toHaveLength(0);
  await click(byTestId('row-menu')[0]);
  expect(byTestId('session-summarise')).toHaveLength(0);
});

test('a recorded action says its warning with its confirmation, so a missing receipt shows', async () => {
  const { bridge } = fakeBridge({
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    sessions: () => envelope([asking]),
    stop: () =>
      envelope({
        ...asking,
        outcome: 'exited',
        receipt: null,
        warning: 'no receipt: the profile has no vault yet',
      }),
  });
  const byTestId = await renderSession(<App />, bridge);
  await click(button('Stop'));
  expect(byTestId('toast')[0]?.textContent).toContain(
    'Stopped session aaaaaaaa; no receipt: the profile has no vault yet',
  );
});

/** The board's own look, which never waits on Faro's adapter. */
const quick = (args: string[]) => args.includes('--no-adapter');

test("a slow adapter look never holds up the board's looks or an action", async () => {
  vi.useFakeTimers();
  try {
    const { bridge, calls } = fakeBridge({
      resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
      // The adapter's look never lands.
      sessions: (args) => (quick(args) ? envelope([asking]) : new Promise(() => {})),
      stop: () => envelope({ ...asking, outcome: 'exited', receipt: null }),
    });
    await renderSession(<App />, bridge);
    await act(async () => vi.advanceTimersByTime(2000));
    await act(async () => vi.advanceTimersByTime(2000));
    expect(calls.filter(quick)).toHaveLength(3);
    expect(calls.filter((c) => c[1] === 'sessions' && !quick(c))).toHaveLength(1);
    await click(button('Stop'));
    expect(calls.filter((c) => c[1] === 'stop')).toHaveLength(1);
    expect(button('Stop')?.hasAttribute('disabled')).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test('an action ends once Sessions shows what it did, even with a look already in flight', async () => {
  vi.useFakeTimers();
  try {
    let release = () => {};
    let slow = false;
    const { bridge, calls } = fakeBridge({
      resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
      sessions: (args) =>
        slow && quick(args)
          ? new Promise((done) => (release = () => done(envelope([asking]))))
          : envelope([asking]),
      stop: () => envelope({ ...asking, outcome: 'exited', receipt: null }),
    });
    await renderSession(<App />, bridge);
    slow = true;
    // The two-second look is in flight when Stop is pressed.
    await act(async () => vi.advanceTimersByTime(2000));
    await click(button('Stop'));
    expect(button('Stop')?.hasAttribute('disabled')).toBe(true);
    await click(button('Stop'));
    expect(calls.filter((c) => c[1] === 'stop')).toHaveLength(1);
    // That look lands, then the one after the stop: only now does the row come back.
    slow = false;
    await act(async () => release());
    expect(button('Stop')?.hasAttribute('disabled')).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test('Sessions refreshes every two seconds without overlapping requests', async () => {
  vi.useFakeTimers();
  try {
    let release = () => {};
    let slow = false;
    const { bridge, calls } = fakeBridge({
      resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
      sessions: (args) =>
        slow && quick(args)
          ? new Promise((done) => (release = () => done(envelope([asking]))))
          : envelope([asking]),
    });
    await renderSession(<App />, bridge);
    const looks = () => calls.filter(quick).length;
    expect(looks()).toBe(1);
    await act(async () => vi.advanceTimersByTime(1000));
    await act(async () => vi.advanceTimersByTime(1000));
    expect(looks()).toBe(2);
    // A slow look: the ticks meanwhile ask for one more look, run once it lands.
    slow = true;
    await act(async () => vi.advanceTimersByTime(2000));
    await act(async () => vi.advanceTimersByTime(4000));
    expect(looks()).toBe(3);
    slow = false;
    await act(async () => release());
    expect(looks()).toBe(4);
  } finally {
    vi.useRealTimers();
  }
});

test('Hand off asks for the note, then hands the session off; one without a goal cannot', async () => {
  const goaled = { ...busy, goal: 'Count the files in docs/adr' };
  const bare = managedRow('dddddddd', { attention: 0.01 });
  const { bridge, calls } = fakeBridge({
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    sessions: () => envelope([goaled, bare] satisfies TreeRow[]),
    handoff: () =>
      envelope({ from: 'bbbbbbbb', to: 'eeeeeeee', note: '/h/.mesa/default/handoffs/eeeeeeee.md' }),
  });
  const byTestId = await renderSession(<App />, bridge, fakePlatform({ file: '/h/note.md' }));
  await click(button('Hand off'));
  // Nothing to hand off with until a note is picked.
  expect(byTestId('handoff-submit')[0]?.hasAttribute('disabled')).toBe(true);
  await click(byTestId('handoff-pick')[0]);
  expect(byTestId('handoff-note')[0]?.textContent).toBe('/h/note.md');
  await choose(byTestId('handoff-agent')[0], 'codex');
  await click(byTestId('handoff-keep')[0]);
  await click(byTestId('handoff-submit')[0]);
  expect(calls.filter((c) => c[1] === 'handoff')).toEqual([
    ['--json', 'handoff', '--note', '/h/note.md', '--keep', '--agent', 'codex', '--', 'bbbbbbbb'],
  ]);
  expect(byTestId('toast')[0]?.textContent).toContain('Handed off bbbbbbbb to eeeeeeee');
  expect(byTestId('handoff-dialog')).toHaveLength(0);
});

test('a session in its own worktree cannot be kept running when it hands off', async () => {
  const worktree = { path: '/h/.mesa/default/worktrees/lantern-cove/tidy', branch: 'tidy' };
  const { bridge, calls } = fakeBridge({
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    sessions: () => envelope([{ ...busy, goal: 'Tidy up', worktree }] satisfies TreeRow[]),
    handoff: () => envelope({ from: 'bbbbbbbb', to: 'eeeeeeee', note: '/n.md' }),
  });
  const byTestId = await renderSession(<App />, bridge, fakePlatform({ file: '/h/note.md' }));
  await click(button('Hand off'));
  expect(byTestId('handoff-keep')[0]?.hasAttribute('disabled')).toBe(true);
  await click(byTestId('handoff-pick')[0]);
  await click(byTestId('handoff-submit')[0]);
  expect(calls.filter((c) => c[1] === 'handoff')).toEqual([
    ['--json', 'handoff', '--note', '/h/note.md', '--', 'bbbbbbbb'],
  ]);
});

test('a resume that ends after another session was chosen keeps that choice', async () => {
  const resumed = deferred();
  const successor = managedRow('eeeeeeee', { resumedFrom: 'cccccccc' });
  let done = false;
  const { bridge } = fakeBridge({
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    projects: () => envelope(PROJECTS),
    sessions: () => envelope(done ? [successor, busy] : [exited, busy]),
    resume: () => resumed.promise,
  });
  const byTestId = await renderSession(<App />, bridge);
  const card = (id: string) => byTestId('sidebar-session').find((item) => item.title.includes(id));
  const current = () =>
    byTestId('sidebar-session').find((item) => item.getAttribute('aria-current') === 'page');
  await click(card('cccccccc'));
  await click(
    [...(byTestId('session-recovery')[0]?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('Restore'),
    ),
  );
  await click(card('bbbbbbbb'));
  done = true;
  await act(async () => resumed.resolve(envelope(successor)));
  expect(current()?.title).toContain('bbbbbbbb');
});

test('a failed action or look shows its error in the toast', async () => {
  const { bridge } = fakeBridge({
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    sessions: () => envelope([asking]),
    attach: () => failure('session ended; use mesa resume'),
  });
  const byTestId = await renderSession(<App />, bridge);
  await click(button('Open in terminal app'));
  expect(byTestId('toast')[0]?.textContent).toContain('session ended; use mesa resume');
  const broken = await renderSession(
    <App />,
    fakeBridge({ sessions: () => failure('tmux is not answering') }).bridge,
  );
  expect(broken('toast')[0]?.textContent).toContain('tmux is not answering');
});

test("the row menu's Rename names a session; Sessions shows the name in place of its id", async () => {
  const named = { ...busy, name: 'tide tables' };
  let renamed = false;
  const { bridge, calls } = fakeBridge({
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    sessions: () => envelope([renamed ? named : busy] satisfies TreeRow[]),
    rename: () => {
      renamed = true;
      return envelope(named);
    },
  });
  const byTestId = await renderSession(<App />, bridge);
  const menu = byTestId('row-menu')[0];
  expect(menu?.getAttribute('aria-label')).toBe('More actions for bbbbbbbb');
  await click(menu);
  expect(menu?.getAttribute('aria-expanded')).toBe('true');
  await click(byTestId('session-rename')[0]);
  (byTestId('rename-name')[0] as HTMLInputElement).value = 'tide tables';
  await click(byTestId('rename-submit')[0]);
  expect(calls).toContainEqual(['--json', 'rename', '--', 'bbbbbbbb', 'tide tables']);
  expect(byTestId('toast')[0]?.textContent).toContain('Renamed bbbbbbbb to tide tables');
  expect(byTestId('rename-dialog')).toHaveLength(0);
  expect(byTestId('selected-session')[0]?.textContent).toContain('tide tables');
});

test('confirmed descendant actions preview the full family and report each result', async () => {
  const parent = { ...asking, children: ['bbbbbbbb'] };
  const child = { ...busy, parent: parent.id, depth: 1 };
  let rows: TreeRow[] = [parent, child];
  const { bridge, calls } = fakeBridge({
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    sessions: () => envelope(rows),
    stop: () => {
      rows = rows.map((row) =>
        row.managed ? { ...row, alive: false, endedAt: '2026-09-25T13:00:00.000Z' } : row,
      );
      return envelope({
        root: parent.id,
        items: [
          { id: child.id, ok: true, result: { outcome: 'killed' } },
          { id: parent.id, ok: true, result: { outcome: 'killed' } },
        ],
      });
    },
    rm: () =>
      envelope({
        root: parent.id,
        items: [
          { id: child.id, ok: false, error: { code: 'usage', message: 'worktree is dirty' } },
          {
            id: parent.id,
            ok: false,
            skipped: true,
            error: { code: 'usage', message: 'descendant did not complete' },
          },
        ],
      }),
  });
  const byTestId = await renderSession(<App />, bridge);
  await click(button('Stop descendants'));
  expect(byTestId('descendant-list')[0]?.textContent).toContain(child.id);
  expect(byTestId('descendant-list')[0]?.textContent?.indexOf(child.id)).toBeLessThan(
    byTestId('descendant-list')[0]?.textContent?.indexOf(parent.id) ?? 0,
  );
  await click(byTestId('descendant-confirm')[0]);
  expect(calls).toContainEqual([
    '--json',
    'stop',
    '--descendants',
    `--expect=${child.id},${parent.id}`,
    '--',
    parent.id,
  ]);
  expect(byTestId('toast')[0]?.textContent).toContain(`${child.id}: killed`);
  await click(byTestId('row-menu')[0]);
  await click(byTestId('session-remove-descendants')[0]);
  await click(byTestId('descendant-confirm')[0]);
  expect(calls).toContainEqual([
    '--json',
    'rm',
    '--descendants',
    `--expect=${child.id},${parent.id}`,
    '--',
    parent.id,
  ]);
  expect(byTestId('toast').some((toast) => toast.textContent?.includes('worktree is dirty'))).toBe(
    true,
  );
});

test("Remove, only once a session's agent exited, lists what goes and passes the worktree flags", async () => {
  const worktree = { path: '/h/.mesa/default/worktrees/lantern-cove/try-x', branch: 'try/x' };
  const ended = { ...exited, worktree };
  const { bridge, calls } = fakeBridge({
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    sessions: () => envelope([busy, ended] satisfies TreeRow[]),
    rm: () =>
      envelope({
        id: 'cccccccc',
        project: 'lantern-cove',
        record: true,
        events: true,
        runOutput: false,
        window: false,
        worktree: worktree.path,
      }),
  });
  const byTestId = await renderSession(<App />, bridge);
  const liveMenu = byTestId('row-menu')[0];
  await click(liveMenu);
  // A live one is stopped first: the app never forces its window closed.
  expect((byTestId('session-remove')[0] as HTMLButtonElement).disabled).toBe(true);
  await click(liveMenu);
  await click(byTestId('search-trigger')[0]);
  await click(byTestId('palette-hit').find((hit) => hit.textContent?.includes('cccccccc')));
  await click(document.querySelector<HTMLElement>('[aria-label="Session actions"]') ?? undefined);
  await click(byTestId('row-menu')[0]);
  await click(byTestId('session-remove')[0]);
  const listed = () => byTestId('remove-list')[0]?.textContent;
  expect(listed()).toBe("session cccccccc's record, its hook log, and its output log");
  await click(byTestId('remove-worktree')[0]);
  expect(listed()).toContain(`its worktree ${worktree.path}`);
  await click(byTestId('remove-confirm')[0]);
  expect(calls).toContainEqual(['--json', 'rm', '--delete-worktree', '--', 'cccccccc']);
  expect(byTestId('toast')[0]?.textContent).toContain('Removed session cccccccc with its worktree');
  expect(byTestId('remove-dialog')).toHaveLength(0);
});

test("the row menu's Log shows a session's last output lines, and reads them again on Refresh", async () => {
  let lines = ['Reading the tide tables', 'High water 06:12'];
  const { bridge, calls } = fakeBridge({
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    sessions: () => envelope([busy, exited] satisfies TreeRow[]),
    logs: (args) =>
      envelope(
        args.at(-1) === 'bbbbbbbb'
          ? { session: 'bbbbbbbb', path: '/h/.mesa/default/sessions/logs/bbbbbbbb.log', lines }
          : { session: 'cccccccc', path: null, lines: [] },
      ),
  });
  const byTestId = await renderSession(<App />, bridge);
  const liveMenu = byTestId('row-menu')[0];
  await click(liveMenu);
  await click(byTestId('session-log')[0]);
  expect(calls).toContainEqual(['--json', 'logs', '--tail', '200', '--', 'bbbbbbbb']);
  expect(byTestId('log-dialog')[0]?.textContent).toContain('Log of bbbbbbbb');
  expect(byTestId('log-lines')[0]?.textContent).toBe('Reading the tide tables\nHigh water 06:12');
  lines = [...lines, 'Low water 12:25'];
  await click(byTestId('log-refresh')[0]);
  expect(byTestId('log-lines')[0]?.textContent).toBe(
    'Reading the tide tables\nHigh water 06:12\nLow water 12:25',
  );
  await click(
    byTestId('log-dialog')[0]?.querySelector<HTMLElement>('button[type="button"]') ?? undefined,
  );
  expect(byTestId('log-dialog')).toHaveLength(0);

  // One with no output log says why it may have none.
  await click(byTestId('search-trigger')[0]);
  await click(byTestId('palette-hit').find((hit) => hit.textContent?.includes('cccccccc')));
  await click(document.querySelector<HTMLElement>('[aria-label="Session actions"]') ?? undefined);
  await click(byTestId('row-menu')[0]);
  await click(byTestId('session-log')[0]);
  expect(byTestId('log-said')[0]?.textContent).toMatch(/^No output log: it has not started/);
  expect(byTestId('log-lines')).toHaveLength(0);
});
