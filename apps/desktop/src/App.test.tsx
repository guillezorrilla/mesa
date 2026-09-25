// @vitest-environment happy-dom
import type {
  Check,
  DoctorReport,
  ForeignRow,
  ManagedRow,
  ProjectRow,
  SessionRow,
  TmuxWindow,
} from '@mesa/core';
import { expect, test } from 'vitest';
import { App } from './App';
import { click, envelope, failure, fakeBridge, fakePlatform, renderWithMesa } from './lib/testing';

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
const cells = (row: HTMLElement | undefined) =>
  [...(row?.querySelectorAll('td') ?? [])].map((td) => td.textContent);

test('the Projects screen lists the fixture projects, marking one whose path is gone', async () => {
  const { bridge } = fakeBridge({ projects: () => envelope(PROJECTS) });
  const byTestId = await renderWithMesa(<App />, bridge);

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
  await click(byTestId('open-session')[0]);
  expect(calls).toContainEqual(['--json', 'open', '--', 'lantern-cove']);
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
  expect(byTestId('project-row')).toHaveLength(0);

  await click(byTestId('register-folder')[0]);
  expect(calls).toContainEqual(['--json', 'register', '--create', '--', '/src/lantern-cove']);
  expect(byTestId('project-row')).toHaveLength(1);
});

test('a cancelled picker registers nothing; a failed register shows in the toast', async () => {
  const cancelled = fakeBridge();
  const quiet = await renderWithMesa(<App />, cancelled.bridge, fakePlatform(null));
  await click(quiet('register-folder')[0]);
  expect(cancelled.calls.some((c) => c[1] === 'register')).toBe(false);

  const clash = fakeBridge({ register: () => failure('already registered: tide at /src/tide') });
  const byTestId = await renderWithMesa(<App />, clash.bridge, fakePlatform('/src/tide'));
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

test('the Sessions screen lists each session with its state and running time', async () => {
  const row = (
    id: string,
    state: ManagedRow['lastState']['state'],
    runningSeconds: number,
  ): SessionRow => ({
    id,
    kind: 'interactive',
    project: 'lantern-cove',
    agent: 'claude',
    tmux: { socket: 'mesa-default', session: 'lantern-cove', window: `claude-${id.slice(0, 6)}` },
    startedAt: '2026-09-25T12:00:00.000Z',
    lastState: { state, confidence: 0.85, at: '2026-09-25T12:00:00.000Z', source: 'tmux' },
    events: [],
    managed: true,
    alive: state !== 'done',
    runningSeconds,
  });
  const foreign: ForeignRow = {
    id: 'ext-4242',
    managed: false,
    agent: 'claude',
    pid: 4242,
    cwd: '/src/elsewhere',
    agentSessionId: '00000000-0000-4000-8000-00000000000e',
    startedAt: '2026-09-25T12:00:00.000Z',
    project: null,
    alive: true,
    agentStatus: 'idle',
    lastState: {
      state: 'idle',
      confidence: 0.85,
      at: '2026-09-25T12:00:00.000Z',
      source: 'listing',
    },
    runningSeconds: 90,
  };
  const { bridge, calls } = fakeBridge({
    sessions: () =>
      envelope([row('aaaaaaaa', 'working', 42), row('bbbbbbbb', 'done', 7500), foreign]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-sessions')[0]);
  expect(byTestId('session-row').map(cells)).toEqual([
    ['aaaaaaaa', 'lantern-cove', 'claude', 'working', '42s', 'SendTerminalStop'],
    // An exited session has no window to attach to.
    ['bbbbbbbb', 'lantern-cove', 'claude', 'done', '2h05m', ''],
    // Started outside Mesa: read-only, no actions.
    ['ext-4242', '-', 'claude', 'idle', '1m30s', 'not managed by Mesa'],
  ]);
  expect(byTestId('session-row')[2]?.dataset.managed).toBe('false');
  expect(byTestId('session-row')[1]?.dataset.alive).toBe('false');
  await click(byTestId('sessions-refresh')[0]);
  await click(byTestId('sessions-ended')[0]);
  expect(calls.filter((c) => c[1] === 'sessions')).toEqual([
    ['--json', 'sessions'],
    ['--json', 'sessions'],
    ['--json', 'sessions', '--all'],
  ]);

  const empty = await renderWithMesa(<App />, fakeBridge().bridge);
  await click(empty('nav-sessions')[0]);
  expect(empty('sessions-empty')).toHaveLength(1);
});

test('Stop ends a live session and Resume reopens an exited one, then the list refreshes', async () => {
  const session = (id: string, alive: boolean): SessionRow => ({
    id,
    kind: 'interactive',
    project: 'lantern-cove',
    agent: 'claude',
    agentSessionId: '00000000-0000-4000-8000-000000000001',
    tmux: { socket: 'mesa-default', session: 'lantern-cove', window: `claude-${id}` },
    startedAt: '2026-09-25T12:00:00.000Z',
    lastState: {
      state: alive ? 'idle' : 'done',
      confidence: 1,
      at: '2026-09-25T12:00:00.000Z',
      source: 'mesa',
    },
    events: [],
    managed: true,
    alive,
    runningSeconds: 5,
  });
  const { bridge, calls } = fakeBridge({
    sessions: () => envelope([session('aaaaaaaa', true), session('bbbbbbbb', false)]),
    stop: () => envelope({ ...session('aaaaaaaa', false), outcome: 'exited' }),
    resume: () => envelope(session('cccccccc', true)),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-sessions')[0]);
  await click(byTestId('session-stop')[0]);
  await click(byTestId('session-resume')[0]);
  expect(calls.filter((c) => ['stop', 'resume'].includes(c[1] ?? ''))).toEqual([
    ['--json', 'stop', '--', 'aaaaaaaa'],
    ['--json', 'resume', '--', 'bbbbbbbb'],
  ]);
  expect(calls.filter((c) => c[1] === 'sessions')).toHaveLength(3);
  expect(byTestId('toast').map((t) => t.querySelector('pre')?.textContent)).toEqual([
    'Stopped session aaaaaaaa',
    'Resumed session bbbbbbbb as cccccccc',
  ]);
});

test('Send types the row prompt into its session, then clears the box', async () => {
  const live: SessionRow = {
    id: 'aaaaaaaa',
    kind: 'interactive',
    project: 'lantern-cove',
    agent: 'claude',
    tmux: { socket: 'mesa-default', session: 'lantern-cove', window: 'claude-aaaaaaaa' },
    startedAt: '2026-09-25T12:00:00.000Z',
    lastState: { state: 'idle', confidence: 0.6, at: '2026-09-25T12:00:00.000Z', source: 'mesa' },
    events: [],
    managed: true,
    alive: true,
    runningSeconds: 5,
  };
  const { bridge, calls } = fakeBridge({
    sessions: () => envelope([live]),
    send: () => envelope({ sent: true, session: 'aaaaaaaa', chars: 9 }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-sessions')[0]);
  const box = byTestId('session-prompt')[0] as HTMLInputElement;
  box.value = 'say hello';
  await click(byTestId('session-send-submit')[0]);
  expect(calls).toContainEqual(['--json', 'send', '--', 'aaaaaaaa', 'say hello']);
  expect(byTestId('toast')[0]?.textContent).toContain('Sent 9 characters to aaaaaaaa');
  expect((byTestId('session-prompt')[0] as HTMLInputElement).value).toBe('');
});

test('Terminal on a session row opens it in the terminal app', async () => {
  const live: SessionRow = {
    id: 'aaaaaaaa',
    kind: 'interactive',
    project: 'lantern-cove',
    agent: 'claude',
    tmux: { socket: 'mesa-default', session: 'lantern-cove', window: 'claude-aaaaaaaa' },
    startedAt: '2026-09-25T12:00:00.000Z',
    lastState: { state: 'idle', confidence: 0.6, at: '2026-09-25T12:00:00.000Z', source: 'mesa' },
    events: [],
    managed: true,
    alive: true,
    runningSeconds: 5,
  };
  const { bridge, calls } = fakeBridge({
    sessions: () => envelope([live]),
    attach: () =>
      envelope({ opened: true, target: 'lantern-cove:claude-aaaaaaaa', app: 'Terminal' }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-sessions')[0]);
  await click(byTestId('session-terminal')[0]);
  expect(calls).toContainEqual(['--json', 'attach', '--app', '--', 'aaaaaaaa']);
  expect(byTestId('toast')[0]?.textContent).toContain(
    'Opened lantern-cove:claude-aaaaaaaa in Terminal',
  );
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
