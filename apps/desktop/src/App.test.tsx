// @vitest-environment happy-dom
import type {
  Check,
  CommandReference,
  DoctorReport,
  ForeignRow,
  ManagedRow,
  ProjectRow,
  TmuxWindow,
  TreeRow,
} from '@mesa/core';
import { act } from 'react';
import { expect, test, vi } from 'vitest';
import { App } from './App';
import {
  click,
  envelope,
  failure,
  fakeBridge,
  fakePlatform,
  fakeTerminals,
  renderWithMesa,
} from './lib/testing';

const PROJECTS: ProjectRow[] = [
  {
    name: 'lantern-cove',
    path: '/src/lantern-cove',
    agent: 'claude',
    priority: 0.5,
    skills: [],
    exists: true,
  },
  { name: 'tide', path: '/src/tide', agent: null, priority: null, skills: [], exists: false },
];
const check = (version: string): Check => ({
  name: 'tmux',
  ok: true,
  status: 'ok',
  version,
  hint: '',
});
const report = (checks: Check[]): DoctorReport => {
  const healthy = checks.every((c) => c.ok);
  const summary = healthy ? 'ready' : 'tmux and at least one agent (claude or codex) are required';
  return { healthy, summary, checks };
};
/** Faro's part of a board row: a middling attention and an empty Decision. */
const placed = {
  attention: 0.5,
  decision: {
    questions: [],
    answers: [],
    backend: 'rules' as const,
    at: '2026-09-25T12:00:00.000Z',
    latencyMs: 0,
  },
};
const cells = (row: HTMLElement | undefined) =>
  [...(row?.querySelectorAll('td') ?? [])].map((td) => td.textContent);

test('the Projects screen lists the fixture projects, marking one whose path is gone', async () => {
  const { bridge } = fakeBridge({ projects: () => envelope(PROJECTS) });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-projects')[0]);

  expect(byTestId('projects-screen')).toHaveLength(1);
  const rows = byTestId('project-row');
  expect(cells(rows[0])).toEqual([
    'lantern-cove',
    '/src/lantern-cove',
    'claude',
    '0.5',
    'Open session',
  ]);
  // A project whose path is gone cannot start a session.
  expect(cells(rows[1])).toEqual(['tide ✗', '/src/tide', '', '', '']);
  expect(byTestId('project-missing')).toHaveLength(1);
});

test('the header shows the profile, the vault path, and a green or red doctor verdict', async () => {
  const healthy = await renderWithMesa(<App />, fakeBridge().bridge);
  expect(healthy('profile-summary')[0]?.textContent).toBe(
    'Profile: default | Vault: /h/vault Open in Obsidian | Doctor: ok',
  );
  expect(healthy('doctor-health')[0]?.style.color).toBe('green');

  const sick = fakeBridge({
    doctor: () => envelope(report([{ name: 'tmux', ok: false, status: 'fail', hint: '' }])),
    'vault status': () => envelope({ path: '/h/vault', ok: false, missing: ['receipts'] }),
  });
  const byTestId = await renderWithMesa(<App />, sick.bridge);
  expect(byTestId('vault-status')[0]?.textContent).toBe('Vault: /h/vault (missing receipts)');
  expect(byTestId('doctor-health')[0]?.textContent).toBe('Doctor: needs attention');
  expect(byTestId('doctor-health')[0]?.style.color).toBe('red');
});

test('Open session starts a session for the row and says so', async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    open: () => envelope({ id: 'a1b2c3d4', project: 'lantern-cove' }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-projects')[0]);
  await click(byTestId('open-session')[0]);
  expect(calls).toContainEqual(['--json', 'open', '--no-parent', '--', 'lantern-cove']);
  expect(byTestId('toast')[0]?.textContent).toContain('Opened session a1b2c3d4 on lantern-cove');
});

test('Register folder picks a folder, registers it with --create, and refreshes the list', async () => {
  let registered = false;
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(registered ? PROJECTS.slice(0, 1) : []),
    register: () => {
      registered = true;
      return envelope({ name: 'lantern-cove', path: '/src/lantern-cove', created: true });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge, fakePlatform('/src/lantern-cove'));
  await click(byTestId('nav-projects')[0]);
  expect(byTestId('project-row')).toHaveLength(0);

  await click(byTestId('register-folder')[0]);
  expect(calls).toContainEqual(['--json', 'register', '--create', '--', '/src/lantern-cove']);
  expect(byTestId('project-row')).toHaveLength(1);
});

test('a cancelled picker registers nothing; a failed register shows in the toast', async () => {
  const cancelled = fakeBridge();
  const quiet = await renderWithMesa(<App />, cancelled.bridge, fakePlatform(null));
  await click(quiet('nav-projects')[0]);
  await click(quiet('register-folder')[0]);
  expect(cancelled.calls.some((c) => c[1] === 'register')).toBe(false);

  const clash = fakeBridge({ register: () => failure('already registered: tide at /src/tide') });
  const byTestId = await renderWithMesa(<App />, clash.bridge, fakePlatform('/src/tide'));
  await click(byTestId('nav-projects')[0]);
  await click(byTestId('register-folder')[0]);
  expect(byTestId('toast').map((t) => t.querySelector('pre')?.textContent)).toEqual([
    'already registered: tide at /src/tide',
  ]);
});

test('the Doctor screen shares the header run; Recheck runs doctor again', async () => {
  let version = 1;
  const { bridge, calls } = fakeBridge({
    doctor: () => envelope(report([check(`3.${version++}`)])),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-doctor')[0]);

  expect(byTestId('doctor-row')[0]?.textContent).toBe('tmux✓3.1');
  await click(byTestId('doctor-recheck')[0]);
  expect(byTestId('doctor-row')[0]?.textContent).toBe('tmux✓3.2');
  expect(calls.filter((c) => c[1] === 'doctor')).toHaveLength(2);
  expect(calls.filter((c) => c[1] === 'windows')).toHaveLength(2);
});

test('the Doctor screen shows which decisions backend Faro uses', async () => {
  const decisions: Check = {
    name: 'decisions',
    ok: true,
    status: 'ok',
    version: 'rules',
    hint: 'adapter is not available; decisions use rules',
  };
  const { bridge } = fakeBridge({ doctor: () => envelope(report([check('3.6'), decisions])) });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-doctor')[0]);
  expect(cells(byTestId('doctor-row')[1])).toEqual([
    'decisions',
    '✓',
    'rules',
    'adapter is not available; decisions use rules',
  ]);
});

type BoardRow = ManagedRow & { depth: number };
/** A Mesa session row as the board receives it; `extra` varies state, attention, liveness. */
const managedRow = (id: string, extra: Partial<BoardRow> = {}): BoardRow => ({
  id,
  kind: 'interactive',
  project: 'lantern-cove',
  agent: 'claude',
  agentSessionId: '00000000-0000-4000-8000-000000000001',
  tmux: { socket: 'mesa-default', session: 'lantern-cove', window: `claude-${id}` },
  startedAt: '2026-09-25T12:00:00.000Z',
  lastState: { state: 'working', confidence: 0.95, at: '2026-09-25T12:00:00.000Z', source: 'hook' },
  events: [],
  managed: true,
  ...placed,
  alive: true,
  runningSeconds: 42,
  children: [],
  depth: 0,
  ...extra,
});
const foreignRow: ForeignRow & { depth: number } = {
  id: 'ext-4242',
  managed: false,
  ...placed,
  attention: 0.33,
  agent: 'claude',
  pid: 4242,
  cwd: '/src/elsewhere',
  agentSessionId: '00000000-0000-4000-8000-00000000000e',
  startedAt: '2026-09-25T12:00:00.000Z',
  project: null,
  alive: true,
  agentStatus: 'idle',
  lastState: { state: 'idle', confidence: 0.85, at: '2026-09-25T12:00:00.000Z', source: 'listing' },
  runningSeconds: 90,
  depth: 0,
};
const asking = managedRow('aaaaaaaa', {
  lastState: {
    state: 'waiting-permission',
    confidence: 0.95,
    at: '2026-09-25T12:00:00.000Z',
    source: 'hook',
  },
  attention: 0.83,
  lastOutput: 'Do you want to proceed?',
});
const busy = managedRow('bbbbbbbb', { attention: 0.08, runningSeconds: 7500 });
const exited = managedRow('cccccccc', {
  alive: false,
  lastState: { state: 'done', confidence: 0.85, at: '2026-09-25T12:00:00.000Z', source: 'tmux' },
  attention: 0.25,
});

// The agent in this pane exited on its own: the window stays (remain-on-exit), the state is done.
const deadPane = managedRow('ffffffff', {
  lastState: { state: 'done', confidence: 0.85, at: '2026-09-25T12:00:00.000Z', source: 'tmux' },
  attention: 0.24,
  lastOutput: 'Bye!',
});

test('the Board is the first screen: every session by attention, with its state, confidence, and output', async () => {
  const { bridge } = fakeBridge({
    // mesa sends the board in its order (attention, children under their parent); the Board keeps it.
    sessions: () => envelope([asking, foreignRow, exited, deadPane, busy] satisfies TreeRow[]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(byTestId('session-board')).toHaveLength(1);
  expect(byTestId('session-row').map((r) => cells(r).slice(0, 7))).toEqual([
    [
      'aaaaaaaa',
      'lantern-cove',
      'claude',
      'waiting-permission 95%',
      '0.83',
      '42s',
      'Do you want to proceed?',
    ],
    // Started outside Mesa: muted, tagged, no actions.
    ['ext-4242', '-', 'claude', 'idle 85%', '0.33', '1m30s', ''],
    ['cccccccc', 'lantern-cove', 'claude', 'done 85%', '0.25', '42s', ''],
    ['ffffffff', 'lantern-cove', 'claude', 'done 85%', '0.24', '42s', 'Bye!'],
    ['bbbbbbbb', 'lantern-cove', 'claude', 'working 95%', '0.08', '2h05m', ''],
  ]);
  expect(byTestId('session-state').map((b) => b.className)).toEqual([
    'badge state-waiting-permission',
    'badge state-idle',
    'badge state-done',
    'badge state-done',
    'badge state-working',
  ]);
  expect(byTestId('session-state')[0]?.title).toBe('decided by rules');
  const [, foreign] = byTestId('session-row');
  expect(foreign?.className).toBe('muted');
  expect(foreign?.textContent).toContain('not managed');
  expect(foreign?.querySelector('button')).toBeNull();
  // Resume once the agent has exited (window gone or pane dead); Send only while it runs.
  const enabled = (id: string) =>
    byTestId(id).map((b) => !(b as HTMLButtonElement | HTMLInputElement).disabled);
  expect(enabled('session-resume')).toEqual([false, true, true, false]);
  expect(enabled('session-prompt')).toEqual([true, false, false, true]);
  expect(enabled('session-stop')).toEqual([true, false, true, true]);
  expect(enabled('open-terminal')).toEqual([true, false, true, true]);

  const empty = await renderWithMesa(<App />, fakeBridge().bridge);
  expect(empty('sessions-empty')).toHaveLength(1);
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
    const byTestId = await renderWithMesa(<App />, bridge);
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
  const byTestId = await renderWithMesa(<App />, bridge);
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

test('clicking a live session opens its terminal here; two at once; Close ends only the client', async () => {
  const terms = fakeTerminals();
  const platform = fakePlatform(null, terms.host);
  const { bridge, calls } = fakeBridge({
    sessions: () => envelope([asking, busy, exited]),
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    attach: () =>
      envelope({ opened: true, target: 'lantern-cove:claude-aaaaaaaa', app: 'Terminal' }),
  });
  const byTestId = await renderWithMesa(<App />, bridge, platform);
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

test('New session opens a dialog, and Open starts the picked project with the picked agent', async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    open: () => envelope({ ...busy, id: 'dddddddd' }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('new-session')[0]);
  const dialog = byTestId('new-session-dialog')[0];
  expect(dialog?.hasAttribute('open')).toBe(true);
  const options = [...(byTestId('new-session-project')[0] as HTMLSelectElement).options];
  expect(options.map((o) => [o.value, o.disabled])).toEqual([
    ['lantern-cove', false],
    // Its folder is gone: it cannot start a session.
    ['tide', true],
  ]);
  const codex = dialog?.querySelector<HTMLInputElement>('input[value="codex"]');
  expect(codex?.disabled).toBe(true);
  await click(byTestId('new-session-submit')[0]);
  expect(calls).toContainEqual([
    '--json',
    'open',
    '--no-parent',
    '--agent',
    'claude',
    '--',
    'lantern-cove',
  ]);
  expect(byTestId('new-session-dialog')).toHaveLength(0);
  expect(byTestId('toast')[0]?.textContent).toContain('Opened session dddddddd on lantern-cove');
});

test("a session's goal shows under its project, its first line, the whole goal on hover", async () => {
  const withGoal = { ...busy, goal: '/goal Keep going until green\nthen stop' };
  const { bridge } = fakeBridge({ sessions: () => envelope([withGoal] satisfies TreeRow[]) });
  const byTestId = await renderWithMesa(<App />, bridge);
  const [goal] = byTestId('session-goal');
  expect(goal?.textContent).toBe('/goal Keep going until green');
  expect(goal?.title).toBe('/goal Keep going until green\nthen stop');
  expect(byTestId('session-goal')).toHaveLength(1);
});

test('New session passes a multi-line goal with --goal; a blank one passes none', async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    open: () => envelope({ ...busy, id: 'dddddddd' }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
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

  await click(byTestId('new-session')[0]);
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
  const byTestId = await renderWithMesa(<App />, bridge);
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
  expect(byTestId('toast').map((t) => t.querySelector('pre')?.textContent)).toEqual([
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
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('open-terminal')[0]);
  expect(byTestId('toast')[0]?.textContent).toContain('session ended; use mesa resume');
  const broken = await renderWithMesa(
    <App />,
    fakeBridge({ sessions: () => failure('tmux is not answering') }).bridge,
  );
  expect(broken('toast')[0]?.textContent).toContain('tmux is not answering');
});

test('the Doctor screen lists the windows on the Mesa tmux server', async () => {
  const window = (name: string, dead: boolean): TmuxWindow => ({
    project: 'lantern-cove',
    window: name,
    index: 0,
    panePid: 4242,
    command: '2.1.282',
    path: '/src/lantern-cove',
    activity: '2026-09-25T12:00:00.000Z',
    dead,
  });
  const { bridge } = fakeBridge({
    windows: () => envelope([window('claude-aaaaaa', false), window('claude-bbbbbb', true)]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-doctor')[0]);
  expect(byTestId('tmux-window').map((li) => li.textContent)).toEqual([
    'lantern-cove:claude-aaaaaa 2.1.282 /src/lantern-cove',
    'lantern-cove:claude-bbbbbb (exited) /src/lantern-cove',
  ]);

  const empty = await renderWithMesa(<App />, fakeBridge().bridge);
  await click(empty('nav-doctor')[0]);
  expect(empty('tmux-none')).toHaveLength(1);
});

test('the Doctor screen shows the Claude hooks and installs them when missing', async () => {
  let installed = false;
  const { bridge, calls } = fakeBridge({
    'hooks status': () =>
      envelope({ path: '/h/.claude/settings.json', installed, stale: false, events: {} }),
    'hooks install': () => {
      installed = true;
      return envelope({
        path: '/h/.claude/settings.json',
        installed,
        stale: false,
        events: {},
        changed: true,
      });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-doctor')[0]);
  expect(byTestId('hooks-status')[0]?.textContent).toBe(
    'Not installed in /h/.claude/settings.json Install',
  );
  await click(byTestId('hooks-install')[0]);
  expect(calls).toContainEqual(['--json', 'hooks', 'install']);
  expect(byTestId('hooks-status')[0]?.textContent).toBe(
    'Installed in /h/.claude/settings.json Uninstall',
  );
});

test('an unhealthy report shows its summary and each row by status', async () => {
  const missing: Check = {
    name: 'tmux',
    ok: false,
    status: 'fail',
    hint: 'install with `brew install tmux`',
  };
  const { bridge } = fakeBridge({ doctor: () => envelope(report([missing])) });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-doctor')[0]);
  expect(byTestId('doctor-summary')[0]?.textContent).toBe(
    'tmux and at least one agent (claude or codex) are required',
  );
  expect(byTestId('doctor-row')[0]?.dataset.status).toBe('fail');
});

test('every distinct failure shows once in the toast', async () => {
  const notInit = failure('config.yaml not found; run mesa init --vault <path>');
  const { bridge } = fakeBridge({
    config: () => notInit,
    'vault status': () => notInit,
    projects: () => notInit,
    doctor: () => {
      throw new Error('mesa exited with code 1: boom');
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  const toasts = byTestId('toast').map((t) => t.querySelector('pre')?.textContent);
  expect(toasts.sort()).toEqual([
    'config.yaml not found; run mesa init --vault <path>',
    'mesa exited with code 1: boom',
  ]);
});

test('the log box sends its line to mesa log and shows the entry', async () => {
  const { bridge, calls } = fakeBridge({
    log: (args) =>
      envelope({
        entry: `- 2026-09-24T12:00:00.000Z ${args.at(-1)}`,
        daily: 'daily/2026-09-24.md',
      }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  const input = byTestId('log-input')[0] as HTMLInputElement;
  input.value = 'shipped #12';
  await click(byTestId('log-submit')[0]);
  expect(calls).toContainEqual(['--json', 'log', '--', 'shipped #12']);
  expect(byTestId('log-last')[0]?.textContent).toBe('- 2026-09-24T12:00:00.000Z shipped #12');
  expect(input.value).toBe('');
});

test('the Receipts screen lists the newest receipts with their summary', async () => {
  const receipt = (id: string, type: string, status: string) => ({
    path: `receipts/2026/09/20260924T120000Z-${type}-${id}.md`,
    receipt: {
      type,
      id,
      profile: 'default',
      started: '2026-09-24T12:00:00.000Z',
      status,
      command: 'mesa x',
      decisions: [],
      inputs: {},
      outputs: {},
    },
    summary: `${type} ${status}`,
    body: `${type} ${status}\n\n## Details\n\nNone.\n`,
  });
  const { bridge } = fakeBridge({
    receipts: () =>
      envelope([receipt('01B', 'action', 'ok'), receipt('01A', 'decision', 'blocked')]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-receipts')[0]);
  const rows = byTestId('receipt-row');
  expect(rows.map((r) => r.dataset.status)).toEqual(['ok', 'blocked']);
  expect(rows[1]?.textContent).toContain('decision blocked');
});

test('Open in Obsidian runs mesa vault open; a failure shows in the toast', async () => {
  const { bridge, calls } = fakeBridge({
    'vault open': () =>
      envelope({ opened: true, method: 'uri', target: 'obsidian://open?vault=vault' }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('open-vault')[0]);
  expect(calls).toContainEqual(['--json', 'vault', 'open']);
  expect(byTestId('toast')).toHaveLength(0);

  const unknown = fakeBridge({
    'vault open': () =>
      failure(
        'Obsidian does not know the vault /h/vault yet: open it once with "Open folder as vault" in Obsidian, then retry',
      ),
  });
  const again = await renderWithMesa(<App />, unknown.bridge);
  await click(again('open-vault')[0]);
  expect(again('toast')[0]?.textContent).toContain('Open folder as vault');
});

test('the Help screen lists every command from mesa help --agent, with its flags and example', async () => {
  const reference: CommandReference[] = [
    {
      name: 'send',
      usage: 'mesa send <session> <prompt> [--force]',
      description: "Type a prompt into a session's agent, then Enter",
      args: [
        { name: 'session', required: true },
        { name: 'prompt', required: true },
      ],
      flags: [
        { name: 'force', type: 'boolean', required: false, description: 'Send to a shell too' },
      ],
      example: 'mesa send a1b2c3d4 "run the tests"',
    },
    {
      name: 'init',
      usage: 'mesa init --vault <string>',
      description: 'Create the profile directory and its config.yaml',
      args: [],
      flags: [{ name: 'vault', type: 'string', required: true, description: 'The vault path' }],
      example: 'mesa init --vault ~/vault',
    },
  ];
  const { bridge, calls } = fakeBridge({ help: () => envelope(reference) });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-help')[0]);

  expect(calls).toContainEqual(['--json', 'help', '--agent']);
  const commands = byTestId('help-command');
  expect(commands.map((c) => c.querySelector('h3')?.textContent)).toEqual([
    'mesa send <session> <prompt> [--force]',
    'mesa init --vault <string>',
  ]);
  expect(commands[0]?.textContent).toContain("Type a prompt into a session's agent, then Enter");
  expect(commands[0]?.textContent).toContain('--force boolean: Send to a shell too');
  expect(commands[1]?.textContent).toContain('--vault string, required: The vault path');
  expect(byTestId('help-example').map((e) => e.textContent)).toEqual([
    'mesa send a1b2c3d4 "run the tests"',
    'mesa init --vault ~/vault',
  ]);
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
  const byTestId = await renderWithMesa(<App />, bridge);
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
  expect(top?.className).toContain('needs-you');
  // A collapsed row with nothing waiting under it is not marked.
  await click(toggles()[1]);
  expect(toggles()[1]?.getAttribute('aria-label')).toBe('Show the session under it');
  expect(toggles()[1]?.className).not.toContain('needs-you');

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
  const byTestId = await renderWithMesa(<App />, bridge);
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
  const byTestId = await renderWithMesa(<App />, bridge);
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
  const byTestId = await renderWithMesa(<App />, bridge);
  (byTestId('session-prompt')[0] as HTMLInputElement).value = 'hello';
  await click(byTestId('session-send-submit')[0]);
  expect(byTestId('toast')[0]?.textContent).toContain('do not send it again');
});

test('the Doctor panel shows both kinds of hook, each with its fix when missing', async () => {
  const hookRows: Check[] = [
    {
      name: 'claude hooks',
      ok: false,
      status: 'warn',
      hint: 'not installed: run `mesa hooks install`',
    },
    {
      name: 'tmux hooks',
      ok: false,
      status: 'warn',
      hint: 'not set on mesa-default: `mesa sessions` starts the server with it',
    },
  ];
  const { bridge } = fakeBridge({ doctor: () => envelope(report(hookRows)) });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-doctor')[0]);
  const rows = byTestId('doctor-row').filter((r) => cells(r)[0]?.endsWith('hooks'));
  expect(rows.map((r) => [cells(r)[0], r.dataset.status, cells(r)[3]])).toEqual([
    ['claude hooks', 'warn', 'not installed: run `mesa hooks install`'],
    ['tmux hooks', 'warn', 'not set on mesa-default: `mesa sessions` starts the server with it'],
  ]);
});
