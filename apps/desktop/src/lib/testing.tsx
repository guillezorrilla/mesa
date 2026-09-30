import type {
  Check,
  Config,
  DoctorReport,
  ForeignRow,
  GuardrailCheck,
  HooksStatus,
  ManagedRow,
  ProfileInfo,
  ProjectContext,
  ProjectRow,
  SessionRow,
  TmuxWindow,
  UsageReport,
  VaultStatus,
} from '@mesa/core';
import { DEFAULT_SHORTCUTS } from '@mesa/core/browser';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Bridge } from './client';
import { MesaRoot } from './MesaRoot';
import type { BrowserHost, Platform, TerminalHost } from './platform';

// React needs this flag to run act() outside a test renderer.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export const envelope = (data: unknown) => ({ ok: true, data });

/** A bridge reply a screen test can complete after a newer request. */
export const deferred = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

/** The toasts showing, each as its tone and its text. */
export const toasts = (byTestId: (id: string) => HTMLElement[]) =>
  byTestId('toast').map((t) => [t.dataset.tone, t.querySelector('pre')?.textContent]);
/** The toasts' texts. */
export const toastTexts = (byTestId: (id: string) => HTMLElement[]) =>
  byTestId('toast').map((t) => t.querySelector('pre')?.textContent);
export const failure = (message: string) => ({ ok: false, error: { code: 'not_found', message } });

/** A healthy, initialised profile with no projects: each test overrides what it varies. */
const HEALTHY: Record<string, (args: string[]) => unknown> = {
  'skills list': () => envelope([]),
  'rules list': () => envelope([]),
  prompts: () => envelope([]),
  profile: () => envelope({ profile: 'default', dir: '/h/.mesa/default' } satisfies ProfileInfo),
  config: () =>
    envelope({
      vault: '/h/vault',
      defaultAgent: 'claude',
      skills: [],
      decisions: { backend: 'adapter', adapter: 'claude', threshold: 0.7 },
      sessions: { log: true },
      usage: { dailyAlertUsd: 0, weeklyAlertUsd: 0, monthlyAlertUsd: 0 },
      notifications: {
        quiet: false,
        inputRequired: 'sound',
        finished: 'silent',
        subagent: 'silent',
        doctor: 'silent',
      },
      application: { warnBeforeQuit: true, backupOnClose: false },
      onboarding: { status: 'complete', step: 0 },
      appearance: {
        theme: 'system',
        font: 'plex',
        fontSize: 16,
        density: 'comfortable',
        colorVision: 'normal',
      },
      terminal: {
        app: 'Terminal',
        theme: 'follow',
        fontSize: 13,
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
        optionAsMeta: false,
        naturalSelection: false,
        scrollSpeed: 3,
        extraSubmitKey: 'none',
        newlineKey: 'native',
        wezTermNewTab: false,
      },
      editor: { fontSize: 13, tabSize: 2, wordWrap: false, vim: false, external: [] },
      worktrees: {
        location: 'profile',
        fetch: false,
        sparseDirectories: [],
        carryIgnoredDirectories: [],
        setup: [],
        teardown: [],
      },
      shortcuts: { ...DEFAULT_SHORTCUTS },
      board: { view: 'list', group: 'none', density: 'comfortable', sort: 'attention', order: [] },
      grid: { groups: [] },
      run: { permissionMode: 'acceptEdits', allowedTools: [] },
      keys: {},
    } satisfies Config),
  'vault status': () => envelope({ path: '/h/vault', ok: true, missing: [] } satisfies VaultStatus),
  'vault context': (args) =>
    envelope({
      project: args[4] ?? '',
      hub: null,
      index: [],
      notes: [],
      decisions: [],
      goals: [],
      more: '',
    } satisfies ProjectContext),
  'vault mcp': () => envelope({ tools: [] }),
  doctor: () => envelope({ healthy: true, summary: 'ready', checks: [] } satisfies DoctorReport),
  diagnostics: () => envelope({ events: [], total: 0, limit: 100 }),
  projects: () => envelope([] satisfies ProjectRow[]),
  receipts: () => envelope([]),
  sessions: () => envelope([] satisfies SessionRow[]),
  usage: () => {
    const zero = {
      events: 0,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      estimatedCostUsd: 0,
    };
    return envelope({
      rows: [],
      unknown: [],
      periods: { today: zero, '7d': zero, '30d': zero, '90d': zero, month: zero },
      daily: [],
      breakdown: [],
      alerts: [],
    } satisfies UsageReport);
  },
  windows: () => envelope([] satisfies TmuxWindow[]),
  'hooks status': () =>
    envelope({
      path: '/h/.claude/settings.json',
      installed: true,
      stale: false,
      events: {},
      codex: {
        path: '/h/.codex/hooks.json',
        installed: true,
        stale: false,
        events: {},
        trusted: {},
        hint: '',
      },
      antigravity: {
        path: '/h/.gemini/config/hooks.json',
        installed: true,
        stale: false,
        events: { PreInvocation: true },
      },
      antigravityVault: {
        path: '/h/.gemini/config/mcp_config.json',
        rulePath: '/h/.gemini/antigravity-cli/settings.json',
        installed: true,
        stale: false,
        server: true,
        rule: true,
      },
      tmux: { socket: 'mesa-default', server: true, paneDied: true },
    } satisfies HooksStatus),
};

/** A bridge answering each mesa command (the words after --json), recording every call. */
export function fakeBridge(answers: Record<string, (args: string[]) => unknown> = {}) {
  const all = { ...HEALTHY, ...answers };
  const calls: string[][] = [];
  const bridge: Bridge = async (args) => {
    calls.push(args);
    // Longest command first (`git branch create`, `vault status`, then `doctor`).
    const answer =
      all[`${args[1]} ${args[2]} ${args[3]}`] ?? all[`${args[1]} ${args[2]}`] ?? all[args[1] ?? ''];
    if (!answer) throw new Error(`no fake answer for ${args.join(' ')}`);
    return answer(args);
  };
  return { bridge, calls };
}

/** Terminals in memory: every call recorded, and `push` plays output into an open one. */
export function fakeTerminals() {
  const calls: (string | number)[][] = [];
  const data = new Map<string, (bytes: Uint8Array) => void>();
  let next = 0;
  const host: TerminalHost = {
    open: async (sessionId, cols, rows) => {
      calls.push(['open', sessionId, cols, rows]);
      next += 1;
      return `t${next}`;
    },
    write: async (termId, text) => void calls.push(['write', termId, text]),
    resize: async (termId, cols, rows) => void calls.push(['resize', termId, cols, rows]),
    close: async (termId) => void calls.push(['close', termId]),
    onData: async (termId, listener) => {
      data.set(termId, listener);
      return () => data.delete(termId);
    },
    onExit: async () => () => {},
    ready: async (termId) => void calls.push(['ready', termId]),
  };
  const push = (termId: string, text: string) => data.get(termId)?.(new TextEncoder().encode(text));
  return { host, calls, push };
}

/** A platform whose pickers return `folder` and `file` (none: the user cancelled). */
export const fakePlatform = ({
  folder = null,
  file = null,
  terminal = fakeTerminals().host,
  browser = {
    owner: async () => ({ pid: 42, socket: '/tmp/mesa-browser-42.sock' }),
    open: async () => 'browser-test',
    navigate: async () => {},
    bounds: async () => {},
    close: async () => {},
    probe: async () => ({ url: 'https://example.test/', title: 'Example', heading: 'Example' }),
    back: async () => {},
    forward: async () => {},
    reload: async () => {},
    pickStart: async () => {},
    pickResult: async () => null,
    onLoad: async () => () => {},
  },
  deepLinks = { current: async () => null, onOpen: async () => () => {} },
  notifications = {
    status: async () => ({
      authorization: 'not-determined' as const,
      alertsEnabled: false,
      soundsEnabled: false,
    }),
    requestPermission: async () => ({
      authorization: 'authorized' as const,
      alertsEnabled: true,
      soundsEnabled: true,
    }),
    send: async () => {},
    onOpen: async () => () => {},
    takeOpened: async () => null,
  },
  lifecycle = { onCloseRequested: async () => () => {}, close: async () => {} },
}: {
  folder?: string | null;
  file?: string | null;
  terminal?: TerminalHost;
  browser?: BrowserHost;
  deepLinks?: Platform['deepLinks'];
  notifications?: Platform['notifications'];
  lifecycle?: Platform['lifecycle'];
} = {}): Platform & {
  pasteboard: string[];
} => {
  const pasteboard: string[] = [];
  return {
    lifecycle,
    pickFolder: async () => folder,
    pickFile: async () => file,
    deepLinks,
    notifications,
    terminal,
    browser,
    clipboard: { write: async (text) => void pasteboard.push(text) },
    pasteboard,
  };
};

let mounted: Root | undefined;

/** Renders `ui` inside the same MesaRoot main.tsx uses, over fakes; returns a test-id query. */
export async function renderWithMesa(ui: ReactNode, bridge: Bridge, platform = fakePlatform()) {
  // The previous render goes first, so its timers (the Board's looks) stop with it.
  await act(async () => mounted?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  const root = document.getElementById('root') as HTMLElement;
  mounted = createRoot(root);
  const created = mounted;
  await act(async () =>
    created.render(
      <MesaRoot bridge={bridge} platform={platform}>
        {ui}
      </MesaRoot>,
    ),
  );
  // The whole document: a dialog renders in a portal outside the root. The body is fresh per render.
  return (id: string) => [...document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
}

export const click = (element: HTMLElement | undefined) =>
  act(async () => {
    element?.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }),
    );
    element?.click();
  });

/** Picks `value` in a select as a person does: the change event React's onChange reads. */
export const choose = (select: HTMLElement | undefined, value: string) =>
  act(async () => {
    (select as HTMLSelectElement).value = value;
    select?.dispatchEvent(new Event('change', { bubbles: true }));
  });

// Fixtures the screens' tests share: projects, doctor checks, and board rows.

export const PROJECTS: ProjectRow[] = [
  {
    name: 'lantern-cove',
    label: 'lantern-cove',
    path: '/src/lantern-cove',
    agent: 'claude',
    priority: 0.5,
    skills: [],
    exists: true,
    pinned: false,
    hidden: false,
  },
  {
    name: 'tide',
    label: 'tide',
    path: '/src/tide',
    agent: null,
    priority: null,
    skills: [],
    exists: false,
    pinned: false,
    hidden: false,
  },
];
/** A doctor report as core sends one, healthy unless told: the screens only show its verdict. */
export const report = (
  checks: Check[],
  verdict: Pick<DoctorReport, 'healthy' | 'summary'> = { healthy: true, summary: 'ready' },
): DoctorReport => ({ ...verdict, checks });
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
export const cells = (row: HTMLElement | undefined) =>
  [...(row?.querySelectorAll('td') ?? [])].map((td) => td.textContent);

type BoardRow = ManagedRow & { depth: number };
/** A Mesa session row as the board receives it; `extra` varies state, attention, liveness. */
export const managedRow = (id: string, extra: Partial<BoardRow> = {}): BoardRow => ({
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
export const foreignRow: ForeignRow & { depth: number } = {
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
export const asking = managedRow('aaaaaaaa', {
  lastState: {
    state: 'waiting-permission',
    confidence: 0.95,
    at: '2026-09-25T12:00:00.000Z',
    source: 'hook',
  },
  attention: 0.83,
  lastOutput: 'Do you want to proceed?',
});
export const busy = managedRow('bbbbbbbb', { attention: 0.08, runningSeconds: 7500 });
export const exited = managedRow('cccccccc', {
  alive: false,
  lastState: { state: 'done', confidence: 0.85, at: '2026-09-25T12:00:00.000Z', source: 'tmux' },
  attention: 0.25,
});

// The agent in this pane exited on its own: the window stays (remain-on-exit), the state is done.
export const deadPane = managedRow('ffffffff', {
  lastState: { state: 'done', confidence: 0.85, at: '2026-09-25T12:00:00.000Z', source: 'tmux' },
  attention: 0.24,
  lastOutput: 'Bye!',
});

/** The envelope `mesa send --json` or `mesa run --json` prints when the guardrail stops its text. */
export const guardrailStopped = (verdict: 'ask' | 'block', reason: string) => ({
  ok: false,
  error: {
    code: 'guardrail_blocked',
    message: reason,
    details: {
      verdict,
      reason,
      decision: {
        questions: [
          { kind: 'Choice', id: 'verdict', options: ['allow', 'ask', 'block'] },
          {
            kind: 'Noul',
            id: 'secret-or-destructive',
            statement: 'This text contains a secret or a destructive instruction',
          },
        ],
        answers: [
          {
            id: 'verdict',
            kind: 'Choice',
            answer: verdict,
            probabilities: { allow: 0.04, ask: 0.95, block: 0.01 },
            confidence: 0.95,
          },
          {
            id: 'secret-or-destructive',
            kind: 'Noul',
            answer: verdict === 'block',
            probabilities: verdict === 'block' ? 0.95 : 0.05,
          },
        ],
        backend: 'rules',
        at: '2026-09-25T12:00:00.000Z',
        latencyMs: 0,
      },
    } satisfies GuardrailCheck,
  },
});
