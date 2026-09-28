// @vitest-environment happy-dom
import type { BoardPreferences, TreeRow } from '@mesa/core';
import { DEFAULT_BOARD_PREFERENCES, DEFAULT_SHORTCUTS } from '@mesa/core/browser';
import { act } from 'react';
import { expect, test, vi } from 'vitest';
import { App } from '@/App';
import {
  asking,
  busy,
  cells,
  choose,
  click,
  deadPane,
  envelope,
  exited,
  failure,
  fakeBridge,
  fakePlatform,
  fakeTerminals,
  foreignRow,
  guardrailStopped,
  managedRow,
  PROJECTS,
  renderWithMesa,
  toasts,
  toastTexts,
} from '@/lib/testing';

test('a recorded action says its warning with its confirmation, so a missing receipt shows', async () => {
  const { bridge } = fakeBridge({
    sessions: () => envelope([asking]),
    stop: () =>
      envelope({
        ...asking,
        outcome: 'exited',
        receipt: null,
        warning: 'no receipt: the profile has no vault yet',
      }),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  await click(byTestId('session-stop')[0]);
  expect(byTestId('toast')[0]?.textContent).toContain(
    'Stopped session aaaaaaaa; no receipt: the profile has no vault yet',
  );
});

test('an action ends once the Board shows what it did, even with a look already in flight', async () => {
  vi.useFakeTimers();
  try {
    let release = () => {};
    let slow = false;
    const { bridge, calls } = fakeBridge({
      sessions: () =>
        slow
          ? new Promise((done) => (release = () => done(envelope([asking]))))
          : envelope([asking]),
      stop: () => envelope({ ...asking, outcome: 'exited', receipt: null }),
    });
    const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
    slow = true;
    // The two-second look is in flight when Stop is pressed.
    await act(async () => vi.advanceTimersByTime(2000));
    await click(byTestId('session-stop')[0]);
    expect(byTestId('session-stop')[0]?.hasAttribute('disabled')).toBe(true);
    await click(byTestId('session-stop')[0]);
    expect(calls.filter((c) => c[1] === 'stop')).toHaveLength(1);
    // That look lands, then the one after the stop: only now does the row come back.
    slow = false;
    await act(async () => release());
    expect(byTestId('session-stop')[0]?.hasAttribute('disabled')).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test('the Board is the first screen: every session by attention, with its state, confidence, and output', async () => {
  const { bridge } = fakeBridge({
    // mesa sends the board in its order (attention, children under their parent); the Board keeps it.
    sessions: () => envelope([asking, foreignRow, exited, deadPane, busy] satisfies TreeRow[]),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  expect(byTestId('session-board')).toHaveLength(1);
  expect(byTestId('session-row').map((r) => cells(r).slice(0, 8))).toEqual([
    [
      'aaaaaaaa',
      'lantern-cove',
      'claude',
      'waiting-permission 95%',
      '0.83',
      '-',
      '42s',
      'Do you want to proceed?',
    ],
    // Started outside Mesa: muted, tagged, no actions.
    ['ext-4242', '-', 'claude', 'idle 85%', '0.33', '-', '1m30s', ''],
    ['cccccccc', 'lantern-cove', 'claude', 'done 85%', '0.25', '-', '42s', ''],
    ['ffffffff', 'lantern-cove', 'claude', 'done 85%', '0.24', '-', '42s', 'Bye!'],
    ['bbbbbbbb', 'lantern-cove', 'claude', 'working 95%', '0.08', '-', '2h05m', ''],
  ]);
  // StateBadge colours by its data-state.
  expect(byTestId('session-state').map((b) => b.dataset.state)).toEqual([
    'waiting-permission',
    'idle',
    'done',
    'done',
    'working',
  ]);
  expect(byTestId('session-state')[0]?.title).toBe('decided by rules');
  const [, foreign] = byTestId('session-row');
  expect(foreign?.dataset.managed).toBe('false');
  expect(foreign?.textContent).toContain('not managed');
  // Its one action is Adopt.
  expect([...(foreign?.querySelectorAll('button') ?? [])].map((b) => b.textContent)).toEqual([
    'Adopt',
  ]);
  // Resume once the agent has exited (window gone or pane dead); Send only while it runs.
  const enabled = (id: string) =>
    byTestId(id).map((b) => !(b as HTMLButtonElement | HTMLInputElement).disabled);
  expect(enabled('session-resume')).toEqual([false, true, true, false]);
  expect(enabled('session-prompt')).toEqual([true, false, false, true]);
  expect(enabled('session-stop')).toEqual([true, false, true, true]);
  expect(enabled('open-terminal')).toEqual([true, false, true, true]);

  const empty = await renderWithMesa(<App startOnBoard />, fakeBridge().bridge);
  expect(empty('sessions-empty')).toHaveLength(1);
});

test('workflow selection uses its own command and leaves Faro state visible', async () => {
  let status: 'review' | undefined;
  const { bridge, calls } = fakeBridge({
    sessions: () => envelope([{ ...asking, workflowStatus: status }]),
    workflow: (args) => {
      status = args.at(-1) as 'review';
      return envelope({ ...asking, workflowStatus: status, receipt: null });
    },
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  const select = byTestId('session-workflow')[0] as HTMLSelectElement;
  await act(async () => {
    select.value = 'review';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(calls.some((args) => args.join(' ') === '--json workflow -- aaaaaaaa review')).toBe(true);
  expect((byTestId('session-workflow')[0] as HTMLSelectElement).value).toBe('review');
  expect(byTestId('session-state')[0]?.dataset.state).toBe('waiting-permission');
});

test('Board layouts, grouping and manual order persist through profile config', async () => {
  let board: BoardPreferences = { ...DEFAULT_BOARD_PREFERENCES };
  const rows = [
    asking,
    { ...busy, parent: asking.id },
    { ...exited, project: 'tide', workflowStatus: 'review' as const },
  ];
  const { bridge, calls } = fakeBridge({
    config: () => envelope({ shortcuts: DEFAULT_SHORTCUTS, board }),
    'config set': (args) => {
      const key = args.at(-2)?.replace('board.', '') as keyof BoardPreferences;
      const value = JSON.parse(args.at(-1) ?? 'null');
      board = { ...board, [key]: value };
      return envelope({ path: `board.${key}`, value, receipt: null });
    },
    'board move': () => {
      board = { ...board, order: ['bbbbbbbb', 'aaaaaaaa', 'cccccccc'] };
      return envelope({ order: board.order, receipt: null });
    },
    sessions: () => envelope(rows),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  await choose(byTestId('board-view')[0], 'cards');
  expect(byTestId('session-card')).toHaveLength(3);
  expect(byTestId('session-relations')[0]?.textContent).toContain('Child of aaaaaaaa');
  await choose(byTestId('board-sort')[0], 'manual');
  await click(document.querySelector('[aria-label="Move bbbbbbbb up"]') as HTMLElement);
  expect(byTestId('session-card').map((card) => card.querySelector('button')?.textContent)).toEqual(
    ['bbbbbbbb', 'aaaaaaaa', 'cccccccc'],
  );
  await choose(byTestId('board-group-select')[0], 'project');
  expect(byTestId('board-group')).toHaveLength(2);
  await choose(byTestId('board-density')[0], 'compact');
  expect(byTestId('board-layout')[0]?.dataset.density).toBe('compact');
  await choose(byTestId('board-view')[0], 'workflow');
  expect(byTestId('board-group')).toHaveLength(6);
  expect(
    byTestId('board-group').find((group) =>
      group.querySelector('h3')?.textContent?.startsWith('review'),
    )?.textContent,
  ).toContain('cccccccc');
  expect(calls.some((args) => args.join(' ') === '--json board move -- bbbbbbbb up')).toBe(true);
});

test('switching Board layouts keeps an embedded terminal attached to its session', async () => {
  const terms = fakeTerminals();
  let board: BoardPreferences = { ...DEFAULT_BOARD_PREFERENCES };
  const { bridge } = fakeBridge({
    config: () => envelope({ shortcuts: DEFAULT_SHORTCUTS, board }),
    'config set': (args) => {
      const key = args.at(-2)?.replace('board.', '') as keyof BoardPreferences;
      const value = JSON.parse(args.at(-1) ?? 'null');
      board = { ...board, [key]: value };
      return envelope({ path: `board.${key}`, value, receipt: null });
    },
    sessions: () => envelope([asking]),
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
  });
  const byTestId = await renderWithMesa(
    <App startOnBoard />,
    bridge,
    fakePlatform({ terminal: terms.host }),
  );
  await click(byTestId('embed-terminal')[0]);
  await act(async () => new Promise((done) => setTimeout(done, 20)));
  expect(byTestId('terminal-aaaaaaaa')).toHaveLength(1);
  await choose(byTestId('board-view')[0], 'cards');
  await choose(byTestId('board-view')[0], 'workflow');
  expect(byTestId('terminal-aaaaaaaa')).toHaveLength(1);
  expect(terms.calls.filter((call) => call[0] === 'close')).toEqual([]);
});

test('the Board looks again every two seconds, one look at a time, and its clock ticks every second', async () => {
  vi.useFakeTimers();
  try {
    let release = () => {};
    let slow = false;
    const { bridge, calls } = fakeBridge({
      sessions: () =>
        slow
          ? new Promise((done) => (release = () => done(envelope([asking]))))
          : envelope([asking]),
    });
    const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
    const looks = () => calls.filter((c) => c[1] === 'sessions').length;
    expect(looks()).toBe(1);
    await act(async () => vi.advanceTimersByTime(1000));
    expect(byTestId('session-running')[0]?.textContent).toBe('43s');
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

test('a late reply for the other list never lands: Show older wins', async () => {
  let release = () => {};
  const { bridge, calls } = fakeBridge({
    sessions: (args) =>
      args.includes('--all')
        ? envelope([asking, exited])
        : new Promise((done) => (release = () => done(envelope([busy])))),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  await click(byTestId('sessions-ended')[0]);
  await act(async () => release());
  expect(calls.filter((c) => c[1] === 'sessions').at(-1)).toEqual([
    '--json',
    'sessions',
    '--all',
    '--tree',
  ]);
  expect(byTestId('session-row').map((r) => cells(r)[0])).toEqual(['aaaaaaaa', 'cccccccc']);
});

test('Show older lets an archived session be restored without restarting it', async () => {
  const archived = { ...exited, archivedAt: '2026-09-25T12:02:00.000Z' };
  const { bridge, calls } = fakeBridge({
    sessions: (args) => envelope(args.includes('--all') ? [archived] : []),
    unarchive: () => envelope({ ...archived, archivedAt: undefined }),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  await click(byTestId('sessions-ended')[0]);
  expect(byTestId('session-row')[0]?.textContent).toContain('archived');
  await click(byTestId('row-menu')[0]);
  await click(byTestId('session-unarchive')[0]);
  expect(calls).toContainEqual(['--json', 'unarchive', '--', archived.id]);
});

test('clicking a live session opens its terminal here; two at once; Close ends only the client', async () => {
  const terms = fakeTerminals();
  const platform = fakePlatform({ terminal: terms.host });
  const { bridge, calls } = fakeBridge({
    sessions: () => envelope([asking, busy, exited]),
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    attach: () =>
      envelope({ opened: true, target: 'lantern-cove:claude-aaaaaaaa', app: 'Terminal' }),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge, platform);
  // Only live Mesa sessions can embed: the exited one has no link.
  expect(byTestId('embed-terminal').map((b) => b.textContent)).toEqual(['aaaaaaaa', 'bbbbbbbb']);
  await click(byTestId('embed-terminal')[0]);
  await click(byTestId('embed-terminal')[1]);
  await act(async () => new Promise((done) => setTimeout(done, 20)));
  expect(byTestId('terminal-aaaaaaaa')).toHaveLength(1);
  expect(byTestId('terminal-bbbbbbbb')).toHaveLength(1);
  const opened = terms.calls.filter((c) => c[0] === 'open');
  expect(opened.map((c) => c[1])).toEqual(['aaaaaaaa', 'bbbbbbbb']);
  // The terminal fits, then the window takes that size: the pty, then mesa resize.
  // Output flows once the listeners are in place: nothing tmux drew first is lost.
  expect(terms.calls).toContainEqual(['ready', 't1']);
  const [, , cols, rows] = opened[0] ?? [];
  expect(terms.calls).toContainEqual(['resize', 't1', cols as number, rows as number]);
  expect(calls).toContainEqual(['--json', 'resize', '--', 'aaaaaaaa', String(cols), String(rows)]);

  // A copy in tmux arrives as OSC 52 and reaches the pasteboard (through Rust in the app).
  await act(async () => {
    terms.push('t1', `\x1b]52;c;${btoa('copied in tmux')}\x07`);
    await new Promise((done) => setTimeout(done, 50));
  });
  expect(platform.pasteboard).toEqual(['copied in tmux']);

  await click(byTestId('open-external-terminal')[0]);
  expect(calls).toContainEqual(['--json', 'attach', '--app', '--', 'aaaaaaaa']);

  await click(byTestId('close-terminal')[0]);
  expect(terms.calls).toContainEqual(['close', 't1']);
  expect(terms.calls).not.toContainEqual(['close', 't2']);
  expect(byTestId('terminal-aaaaaaaa')).toHaveLength(0);
  expect(byTestId('terminal-bbbbbbbb')).toHaveLength(1);
  // No stop, no kill-window: only the client went.
  expect(calls.some((c) => c[1] === 'stop')).toBe(false);
});

test('another screen hides the Board without closing its terminals or its Show older', async () => {
  const terms = fakeTerminals();
  const platform = fakePlatform({ terminal: terms.host });
  const { bridge } = fakeBridge({
    sessions: () => envelope([asking, busy]),
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge, platform);
  await click(byTestId('embed-terminal')[0]);
  await click(byTestId('embed-terminal')[1]);
  await click(byTestId('sessions-ended')[0]);
  await click(byTestId('nav-doctor')[0]);
  expect(byTestId('session-board')[0]?.closest('[hidden]')).not.toBeNull();
  await click(byTestId('nav-board')[0]);
  expect(byTestId('session-board')[0]?.closest('[hidden]')).toBeNull();
  expect(byTestId('terminal-aaaaaaaa')).toHaveLength(1);
  expect(byTestId('terminal-bbbbbbbb')).toHaveLength(1);
  expect(terms.calls.filter((c) => c[0] === 'close')).toEqual([]);
  expect(byTestId('sessions-ended')[0]?.getAttribute('data-state')).toBe('checked');
});

test('New session opens a dialog, and Open starts the picked project with the picked agent', async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    open: () => envelope({ ...busy, id: 'dddddddd' }),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  await click(byTestId('new-session')[0]);
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
    projects: () => envelope(PROJECTS),
    open: () => envelope({ ...busy, id: 'dddddddd' }),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  await click(byTestId('new-session')[0]);
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
    projects: () => envelope(PROJECTS),
    sessions: () => envelope(rows),
    open: () => {
      rows = [busy, opened];
      return envelope(opened);
    },
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  await click(byTestId('new-session')[0]);
  await click(byTestId('new-session-submit')[0]);
  expect(byTestId('selected-session')).toHaveLength(1);
  expect(byTestId('terminal-newnewnew')).toHaveLength(1);
  expect(document.body.textContent).not.toContain('Session unavailable');
});

test("a session's goal shows under its project, its first line, the whole goal on hover", async () => {
  const withGoal = { ...busy, goal: '/goal Keep going until green\nthen stop' };
  const { bridge } = fakeBridge({ sessions: () => envelope([withGoal] satisfies TreeRow[]) });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  const [goal] = byTestId('session-goal');
  expect(goal?.textContent).toBe('/goal Keep going until green');
  expect(goal?.title).toBe('/goal Keep going until green\nthen stop');
  expect(byTestId('session-goal')).toHaveLength(1);
});

test('a headless run is badged run beside its agent, shows its skill as its goal, and has no Send or Hand off', async () => {
  const done = managedRow('dddddddd', {
    kind: 'run',
    goal: '/session-summary focus on tests',
    alive: false,
    endedAt: '2026-09-25T12:01:00.000Z',
    lastState: { state: 'done', confidence: 1, at: '2026-09-25T12:01:00.000Z', source: 'mesa' },
  });
  // Live too: its agent reads no input, so there is nothing to type into it.
  const live = managedRow('eeeeeeee', { kind: 'run', goal: '/session-summary', attention: 0.01 });
  const { bridge } = fakeBridge({
    sessions: () => envelope([busy, done, live] satisfies TreeRow[]),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  expect(byTestId('session-send')).toHaveLength(1);
  expect(byTestId('session-handoff')).toHaveLength(1);
  expect(byTestId('session-send')[0]?.closest('tr')?.textContent).toContain('bbbbbbbb');
  const [badge] = byTestId('session-run');
  expect(byTestId('session-run')).toHaveLength(2);
  expect(badge?.closest('tr')?.querySelector('[data-testid="session-state"]')?.textContent).toBe(
    'done 100%',
  );
  expect(badge?.closest('td')?.textContent).toBe('clauderun');
  expect(byTestId('session-goal').map((g) => g.textContent)).toEqual([
    '/session-summary focus on tests',
    '/session-summary',
  ]);
});

test('New session passes a multi-line goal with --goal; a blank one passes none', async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    open: () => envelope({ ...busy, id: 'dddddddd' }),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  await click(byTestId('new-session')[0]);
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
    [...(menu.parentElement?.querySelectorAll('button') ?? [])].find(
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
    projects: () => envelope(PROJECTS),
    open: () => envelope({ ...busy, id: 'dddddddd' }),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  await click(byTestId('new-session')[0]);
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
    [...(menu.parentElement?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'lantern-cove',
    ),
  );
  (byTestId('new-session-branch')[0] as HTMLInputElement).value = '  ';
  await click(byTestId('new-session-submit')[0]);
  expect(calls.filter((c) => c[1] === 'open').at(-1)).not.toContainEqual(
    expect.stringMatching(/^--branch/),
  );
});

test('Adopt on Claude and Codex foreign rows uses the same native import action', async () => {
  const warning = 'end the session in its original terminal first: both hold the same transcript';
  const placedForeign = { ...foreignRow, project: 'lantern-cove' };
  const { bridge, calls } = fakeBridge({
    sessions: () =>
      envelope([
        placedForeign,
        { ...foreignRow, id: 'ext-7', pid: 7, agent: 'codex' },
      ] satisfies TreeRow[]),
    adopt: () => envelope({ ...busy, id: 'eeeeeeee', warning }),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  const [first, second] = byTestId('session-adopt');
  await click(first);
  expect(calls).toContainEqual([
    '--json',
    'adopt',
    '--project',
    'lantern-cove',
    '--',
    foreignRow.agentSessionId,
  ]);
  expect(byTestId('toast')[0]?.textContent).toContain(`Adopted as eeeeeeee; ${warning}`);
  // A row in no project leaves the project to mesa.
  await click(second);
  expect(calls.filter((c) => c[1] === 'adopt').at(-1)).toEqual([
    '--json',
    'adopt',
    '--',
    foreignRow.agentSessionId,
  ]);
});

test("a session's branch shows under its project, its worktree on hover", async () => {
  const worktree = { path: '/h/.mesa/default/worktrees/lantern-cove/try-x', branch: 'try/x' };
  const { bridge } = fakeBridge({
    sessions: () => envelope([{ ...busy, worktree }, asking] satisfies TreeRow[]),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  const [branch] = byTestId('session-branch');
  expect(branch?.textContent).toBe('try/x');
  expect(branch?.title).toBe(worktree.path);
  expect(byTestId('session-branch')).toHaveLength(1);
});

test('a queued row says what it waits on and has Cancel, which stops it; it cannot resume', async () => {
  let cancelled = false;
  const at = '2026-09-25T12:00:00.000Z';
  const queuedRow = managedRow('dddddddd', {
    agentSessionId: undefined,
    after: 'aaaaaaaa',
    parent: 'aaaaaaaa',
    pending: { branch: 'second' },
    alive: false,
    attention: 0,
    runningSeconds: 0,
    decision: undefined,
    lastState: { state: 'queued', confidence: 1, at, source: 'mesa' },
  });
  const { bridge, calls } = fakeBridge({
    sessions: () =>
      envelope([
        asking,
        cancelled
          ? {
              ...queuedRow,
              pending: undefined,
              endedAt: at,
              lastState: { state: 'stopped', confidence: 1, at, source: 'mesa' },
            }
          : queuedRow,
      ] satisfies TreeRow[]),
    stop: () => {
      cancelled = true;
      return envelope({ ...queuedRow, outcome: 'cancelled' });
    },
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  const row = () => byTestId('session-row')[1] as HTMLElement;
  const inRow = (id: string) => row().querySelector(`[data-testid="${id}"]`) as HTMLElement;
  expect(inRow('session-waiting')?.textContent).toBe('waiting on aaaaaaaa');
  expect(inRow('session-state')?.dataset.state).toBe('queued');
  expect(inRow('session-state')?.title).toBe('set by Mesa: its agent has not run');
  expect(inRow('session-branch')?.textContent).toBe('second');
  expect(inRow('session-send-submit')?.hasAttribute('disabled')).toBe(true);
  expect(inRow('session-resume')?.hasAttribute('disabled')).toBe(true);
  expect(inRow('session-stop')?.textContent).toBe('Cancel');
  // Removed, it would leave what waits on it waiting on nothing: it is cancelled first.
  await click(inRow('row-menu'));
  expect((byTestId('session-remove')[0] as HTMLButtonElement).disabled).toBe(true);
  await click(inRow('row-menu'));
  await click(inRow('session-stop'));
  expect(calls.filter((c) => c[1] === 'stop')).toEqual([['--json', 'stop', '--', 'dddddddd']]);
  expect(toastTexts(byTestId)).toEqual(['Cancelled session dddddddd: it never starts']);
  expect(inRow('session-state')?.dataset.state).toBe('stopped');
  expect(inRow('session-waiting')).toBeNull();
  expect(inRow('session-stop')?.hasAttribute('disabled')).toBe(true);
  expect(inRow('session-resume')?.hasAttribute('disabled')).toBe(true);
});

test('dependency controls keep the tree parent separate from a queued wait, with Start now explicit', async () => {
  const at = '2026-09-25T12:00:00.000Z';
  let row = managedRow('dddddddd', {
    agentSessionId: undefined,
    parent: 'aaaaaaaa',
    after: 'aaaaaaaa',
    pending: {},
    alive: false,
    lastState: { state: 'queued', confidence: 1, at, source: 'mesa' },
  });
  const { bridge, calls } = fakeBridge({
    sessions: () => envelope([asking, busy, row] satisfies TreeRow[]),
    dependency: (args) => {
      row = {
        ...row,
        ...(args.includes('--parent') ? { parent: undefined } : {}),
        ...(args.includes('--after') ? { after: 'bbbbbbbb' } : {}),
      };
      return envelope(row);
    },
    'force-start': () => {
      row = {
        ...row,
        after: undefined,
        pending: undefined,
        alive: true,
        lastState: { state: 'idle', confidence: 1, at, source: 'mesa' },
      };
      return envelope(row);
    },
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  await click(byTestId('row-menu')[2]);
  await click(byTestId('session-dependency')[0]);
  expect(byTestId('dependency-dialog')[0]?.textContent).toContain(
    'Parent places a session in the tree',
  );
  expect((byTestId('dependency-after')[0] as HTMLSelectElement).value).toBe('aaaaaaaa');
  await choose(byTestId('dependency-parent')[0], 'none');
  await click(byTestId('dependency-submit')[0]);
  expect(calls).toContainEqual(['--json', 'dependency', '--parent', 'none', '--', 'dddddddd']);
  expect(row.after).toBe('aaaaaaaa');
  await click(byTestId('row-menu')[2]);
  await click(byTestId('session-dependency')[0]);
  await choose(byTestId('dependency-after')[0], 'bbbbbbbb');
  await click(byTestId('dependency-submit')[0]);
  expect(calls).toContainEqual(['--json', 'dependency', '--after', 'bbbbbbbb', '--', 'dddddddd']);
  expect(row.parent).toBeUndefined();
  await click(byTestId('session-force-start')[0]);
  expect(calls).toContainEqual(['--json', 'force-start', '--', 'dddddddd']);
  expect(byTestId('session-force-start')).toHaveLength(0);
});

test('after a /clear moves its agent session id, the row keeps its state and actions', async () => {
  vi.useFakeTimers();
  try {
    let cleared = false;
    const after = '00000000-0000-4000-8000-0000000000cc';
    const { bridge } = fakeBridge({
      sessions: () => envelope([cleared ? { ...busy, agentSessionId: after } : busy]),
    });
    const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
    const seen = () => ({
      rows: byTestId('session-row').length,
      state: byTestId('session-state')[0]?.dataset.state,
      send: byTestId('session-send-submit')[0]?.hasAttribute('disabled'),
      stop: byTestId('session-stop')[0]?.hasAttribute('disabled'),
      terminal: byTestId('open-terminal')[0]?.hasAttribute('disabled'),
      resume: byTestId('session-resume')[0]?.hasAttribute('disabled'),
    });
    const before = seen();
    expect(before).toEqual({
      rows: 1,
      state: 'working',
      send: false,
      stop: false,
      terminal: false,
      resume: true,
    });
    cleared = true;
    await act(async () => vi.advanceTimersByTime(2000));
    expect(seen()).toEqual(before);
  } finally {
    vi.useRealTimers();
  }
});

test('each row shows its context use as a bar: amber from 55%, red from 60%, a dash with none', async () => {
  const context = (used: number) => ({
    context: {
      used,
      window: 200_000,
      at: '2026-09-25T12:00:00.000Z',
      source: 'transcript' as const,
    },
  });
  const { bridge } = fakeBridge({
    sessions: () =>
      envelope([
        managedRow('aaaaaaaa', { attention: 0.5, ...context(54.4) }),
        managedRow('bbbbbbbb', { attention: 0.4, ...context(54.5) }),
        managedRow('cccccccc', { attention: 0.3, ...context(60.2) }),
        managedRow('dddddddd', { attention: 0.2 }),
      ] satisfies TreeRow[]),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  const cells = byTestId('session-context');
  // By the percent shown: 54.5 reads 55%, so it is amber.
  expect(cells.map((c) => c.textContent)).toEqual(['54%', '55%', '60%', '-']);
  expect(byTestId('context-bar').map((b) => b.dataset.tone)).toEqual(['normal', 'amber', 'red']);
  expect(byTestId('context-bar')[2]?.title).toBe('60.2% of a 200,000-token window');
});

test('Hand off asks for the note, then hands the session off; one without a goal cannot', async () => {
  const goaled = { ...busy, goal: 'Count the files in docs/adr' };
  const bare = managedRow('dddddddd', { attention: 0.01 });
  const { bridge, calls } = fakeBridge({
    sessions: () => envelope([goaled, bare] satisfies TreeRow[]),
    handoff: () =>
      envelope({ from: 'bbbbbbbb', to: 'eeeeeeee', note: '/h/.mesa/default/handoffs/eeeeeeee.md' }),
  });
  const byTestId = await renderWithMesa(
    <App startOnBoard />,
    bridge,
    fakePlatform({ file: '/h/note.md' }),
  );
  const [handoff, none] = byTestId('session-handoff');
  expect(none?.hasAttribute('disabled')).toBe(true);
  await click(handoff);
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
    sessions: () => envelope([{ ...busy, goal: 'Tidy up', worktree }] satisfies TreeRow[]),
    handoff: () => envelope({ from: 'bbbbbbbb', to: 'eeeeeeee', note: '/n.md' }),
  });
  const byTestId = await renderWithMesa(
    <App startOnBoard />,
    bridge,
    fakePlatform({ file: '/h/note.md' }),
  );
  await click(byTestId('session-handoff')[0]);
  expect(byTestId('handoff-keep')[0]?.hasAttribute('disabled')).toBe(true);
  await click(byTestId('handoff-pick')[0]);
  await click(byTestId('handoff-submit')[0]);
  expect(calls.filter((c) => c[1] === 'handoff')).toEqual([
    ['--json', 'handoff', '--note', '/h/note.md', '--', 'bbbbbbbb'],
  ]);
});

test('Send on Enter, Open terminal, then Stop and Resume on the same row, each said in a toast', async () => {
  let stopped = false;
  const { bridge, calls } = fakeBridge({
    sessions: () =>
      envelope([
        stopped ? { ...asking, alive: false, endedAt: '2026-09-25T12:05:00.000Z' } : asking,
      ]),
    send: () => envelope({ sent: true, session: 'aaaaaaaa', chars: 5 }),
    stop: () => {
      stopped = true;
      return envelope({ ...asking, alive: false, outcome: 'exited' });
    },
    resume: () => envelope({ ...asking, id: 'eeeeeeee' }),
    attach: () =>
      envelope({ opened: true, target: 'lantern-cove:claude-aaaaaaaa', app: 'Terminal' }),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  const box = byTestId('session-prompt')[0] as HTMLInputElement;
  box.value = 'hello';
  // Enter in the field submits its form (requestSubmit is what the browser does on Enter).
  await act(async () => (byTestId('session-send')[0] as HTMLFormElement).requestSubmit());
  await click(byTestId('open-terminal')[0]);
  expect(byTestId('session-resume')[0]?.hasAttribute('disabled')).toBe(true);
  await click(byTestId('session-stop')[0]);
  // The look after Stop shows it ended: Resume is now open for the same row.
  expect(byTestId('session-resume')[0]?.hasAttribute('disabled')).toBe(false);
  await click(byTestId('session-resume')[0]);
  expect(calls.filter((c) => ['send', 'stop', 'resume', 'attach'].includes(c[1] ?? ''))).toEqual([
    ['--json', 'send', '--no-from', '--', 'aaaaaaaa', 'hello'],
    ['--json', 'attach', '--app', '--', 'aaaaaaaa'],
    ['--json', 'stop', '--', 'aaaaaaaa'],
    ['--json', 'resume', '--', 'aaaaaaaa'],
  ]);
  expect((byTestId('session-prompt')[0] as HTMLInputElement).value).toBe('');
  expect(toastTexts(byTestId)).toEqual([
    'Sent 5 characters to aaaaaaaa',
    'Opened lantern-cove:claude-aaaaaaaa in Terminal',
    'Stopped session aaaaaaaa',
    'Resumed session aaaaaaaa as eeeeeeee',
  ]);
});

test('a failed action or look shows its error in the toast', async () => {
  const { bridge } = fakeBridge({
    sessions: () => envelope([asking]),
    attach: () => failure('session ended; use mesa resume'),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  await click(byTestId('open-terminal')[0]);
  expect(byTestId('toast')[0]?.textContent).toContain('session ended; use mesa resume');
  const broken = await renderWithMesa(
    <App startOnBoard />,
    fakeBridge({ sessions: () => failure('tmux is not answering') }).bridge,
  );
  expect(broken('toast')[0]?.textContent).toContain('tmux is not answering');
});

test('a child row sits under its parent; a toggle hides the rows under it and says if one waits', async () => {
  const parent = managedRow('aaaaaaaa', { attention: 0.9, children: ['bbbbbbbb'] });
  const child = managedRow('bbbbbbbb', { parent: 'aaaaaaaa', depth: 1, children: ['dddddddd'] });
  const waiting = managedRow('dddddddd', {
    parent: 'bbbbbbbb',
    depth: 2,
    attention: 0.9,
    lastState: {
      state: 'waiting-question',
      confidence: 0.95,
      at: '2026-09-25T12:00:00.000Z',
      source: 'hook',
    },
  });
  const loose = managedRow('cccccccc', { attention: 0.2, children: ['eeeeeeee'] });
  const quiet = managedRow('eeeeeeee', { attention: 0.1, parent: 'cccccccc', depth: 1 });
  const { bridge, calls } = fakeBridge({
    sessions: () => envelope([parent, child, waiting, loose, quiet]),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  expect(calls).toContainEqual(['--json', 'sessions', '--tree']);
  const rows = () => byTestId('session-row').map((r) => [cells(r)[0], r.dataset.depth]);
  const toggles = () => byTestId('session-toggle');
  expect(rows()).toEqual([
    ['▾ aaaaaaaa', '0'],
    ['▾ bbbbbbbb', '1'],
    ['dddddddd', '2'],
    ['▾ cccccccc', '0'],
    ['eeeeeeee', '1'],
  ]);

  // Collapse the child, then the parent: each hides every row under it, and says how many.
  await click(toggles()[1]);
  expect(rows().map(([id]) => id)).toEqual([
    '▾ aaaaaaaa',
    '▸ 1 bbbbbbbb',
    '▾ cccccccc',
    'eeeeeeee',
  ]);
  expect(toggles()[1]?.getAttribute('aria-label')).toBe(
    'Show the session under it, one waits on you',
  );
  await click(toggles()[0]);
  expect(rows().map(([id]) => id)).toEqual(['▸ 2 aaaaaaaa', '▾ cccccccc', 'eeeeeeee']);
  const [top] = toggles();
  expect(top?.getAttribute('aria-expanded')).toBe('false');
  expect(top?.getAttribute('aria-label')).toBe('Show the 2 sessions under it, one waits on you');
  expect(top?.dataset.waits).toBe('true');
  // A collapsed row with nothing waiting under it is not marked.
  await click(toggles()[1]);
  expect(toggles()[1]?.getAttribute('aria-label')).toBe('Show the session under it');
  expect(toggles()[1]?.dataset.waits).toBe('false');

  // Opening the parent again keeps the child collapsed.
  await click(top);
  expect(rows().map(([id]) => id)).toEqual(['▾ aaaaaaaa', '▸ 1 bbbbbbbb', '▸ 1 cccccccc']);
});

test("a session's received prompts list each one with its sender, newest first", async () => {
  const reply = managedRow('bbbbbbbb', {
    events: [
      { type: 'send', at: '2026-09-25T12:00:00.000Z', chars: 12 },
      { type: 'send', at: '2026-09-25T12:05:00.000Z', chars: 29, from: 'aaaaaaaa' },
      { type: 'sent', at: '2026-09-25T12:06:00.000Z', chars: 4, to: 'aaaaaaaa' },
    ],
  });
  const quiet = managedRow('cccccccc');
  const { bridge } = fakeBridge({ sessions: () => envelope([reply, quiet]) });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  expect(byTestId('session-received')).toHaveLength(1);
  expect(byTestId('session-received')[0]?.querySelector('summary')?.textContent).toBe(
    'Received (2)',
  );
  const prompts = byTestId('received-prompt').map((m) => m.textContent ?? '');
  expect(prompts[0]).toMatch(/^from session aaaaaaaa, 29 characters, /);
  // A prompt from another day shows its date too.
  expect(prompts[1]).toMatch(/^from a person, 12 characters, .*\d{4}/);
});

test('a prompt received today shows its time alone', async () => {
  const today = managedRow('bbbbbbbb', {
    events: [{ type: 'send', at: new Date().toISOString(), chars: 5 }],
  });
  const { bridge } = fakeBridge({ sessions: () => envelope([today]) });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  const [prompt] = byTestId('received-prompt');
  expect(prompt?.textContent).toMatch(/^from a person, 5 characters, \S+/);
  expect(prompt?.textContent).not.toMatch(/\d{4}/);
});

test('a send typed with a warning says so in the toast, so it is not sent again', async () => {
  const { bridge } = fakeBridge({
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
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  (byTestId('session-prompt')[0] as HTMLInputElement).value = 'hello';
  await click(byTestId('session-send-submit')[0]);
  expect(byTestId('toast')[0]?.textContent).toContain('do not send it again');
});

test("the guardrail's ask opens a dialog with its reason and decision; Send anyway sends with --yes", async () => {
  const { bridge, calls } = fakeBridge({
    sessions: () => envelope([managedRow('aaaaaaaa')]),
    send: (args) =>
      args.includes('--yes')
        ? envelope({ sent: true, session: 'aaaaaaaa', from: null, chars: 5, override: 'yes' })
        : guardrailStopped('ask', 'project lantern-cove has guardrail: strict'),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  const box = () => byTestId('session-prompt')[0] as HTMLInputElement;
  box().value = 'hello';
  await click(byTestId('session-send-submit')[0]);
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

  await click(byTestId('session-send-submit')[0]);
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
    sessions: () => envelope([managedRow('aaaaaaaa')]),
    send: () => guardrailStopped('block', 'the text holds a destructive command (rm -rf)'),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  (byTestId('session-prompt')[0] as HTMLInputElement).value = 'run rm -rf /';
  await click(byTestId('session-send-submit')[0]);
  expect(byTestId('guardrail-dialog')).toEqual([]);
  expect(toasts(byTestId)).toEqual([
    ['alert', 'Not sent to aaaaaaaa: the text holds a destructive command (rm -rf)'],
  ]);
  expect(calls.filter((c) => c[1] === 'send')).toHaveLength(1);
  expect((byTestId('session-prompt')[0] as HTMLInputElement).value).toBe('run rm -rf /');
});

test("the row menu's Rename names a session; the Board shows the name in place of its id", async () => {
  const named = { ...busy, name: 'tide tables' };
  let renamed = false;
  const { bridge, calls } = fakeBridge({
    sessions: () => envelope([renamed ? named : busy] satisfies TreeRow[]),
    rename: () => {
      renamed = true;
      return envelope(named);
    },
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
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
  const [id] = byTestId('embed-terminal');
  expect(id?.textContent).toBe('tide tables');
  expect(id?.title).toBe('Open its terminal here (bbbbbbbb)');
});

test("Remove, only once a session's agent exited, lists what goes and passes the worktree flags", async () => {
  const worktree = { path: '/h/.mesa/default/worktrees/lantern-cove/try-x', branch: 'try/x' };
  const ended = { ...exited, worktree };
  const { bridge, calls } = fakeBridge({
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
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  const [liveMenu, endedMenu] = byTestId('row-menu');
  await click(liveMenu);
  // A live one is stopped first: the app never forces its window closed.
  expect((byTestId('session-remove')[0] as HTMLButtonElement).disabled).toBe(true);
  await click(liveMenu);
  await click(endedMenu);
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
    sessions: () => envelope([busy, exited] satisfies TreeRow[]),
    logs: (args) =>
      envelope(
        args.at(-1) === 'bbbbbbbb'
          ? { session: 'bbbbbbbb', path: '/h/.mesa/default/sessions/logs/bbbbbbbb.log', lines }
          : { session: 'cccccccc', path: null, lines: [] },
      ),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  const [liveMenu, endedMenu] = byTestId('row-menu');
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
  await click(endedMenu);
  await click(byTestId('session-log')[0]);
  expect(byTestId('log-said')[0]?.textContent).toMatch(/^No output log: it has not started/);
  expect(byTestId('log-lines')).toHaveLength(0);
});

test('skills launch in the terminal, and historical receipts have no primary app page', async () => {
  const { bridge } = fakeBridge({ sessions: () => envelope([asking]) });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  expect(byTestId('run-skill')).toHaveLength(0);
  expect(byTestId('nav-receipts')).toHaveLength(0);
  await click(byTestId('row-menu')[0]);
  expect(byTestId('session-summarise')).toHaveLength(0);
});
