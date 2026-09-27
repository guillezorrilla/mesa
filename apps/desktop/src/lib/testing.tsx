import type {
  Check,
  Config,
  DoctorReport,
  ForeignRow,
  HooksStatus,
  ManagedRow,
  ProfileInfo,
  ProjectRow,
  SessionRow,
  TmuxWindow,
  VaultStatus,
} from '@mesa/core';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Bridge } from './client';
import { MesaRoot } from './MesaRoot';
import type { Platform, TerminalHost } from './platform';

// React needs this flag to run act() outside a test renderer.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export const envelope = (data: unknown) => ({ ok: true, data });
export const failure = (message: string) => ({ ok: false, error: { code: 'not_found', message } });

/** A healthy, initialised profile with no projects: each test overrides what it varies. */
const HEALTHY: Record<string, (args: string[]) => unknown> = {
  'skills list': () => envelope([]),
  profile: () => envelope({ profile: 'default', dir: '/h/.mesa/default' } satisfies ProfileInfo),
  config: () =>
    envelope({
      vault: '/h/vault',
      defaultAgent: 'claude',
      skills: [],
      decisions: { backend: 'adapter', threshold: 0.7 },
      sessions: { log: true },
      terminal: { app: 'Terminal' },
      keys: {},
    } satisfies Config),
  'vault status': () => envelope({ path: '/h/vault', ok: true, missing: [] } satisfies VaultStatus),
  doctor: () => envelope({ healthy: true, summary: 'ready', checks: [] } satisfies DoctorReport),
  projects: () => envelope([] satisfies ProjectRow[]),
  sessions: () => envelope([] satisfies SessionRow[]),
  windows: () => envelope([] satisfies TmuxWindow[]),
  'hooks status': () =>
    envelope({
      path: '/h/.claude/settings.json',
      installed: true,
      stale: false,
      events: {},
      tmux: { socket: 'mesa-default', server: true, paneDied: true },
    } satisfies HooksStatus),
};

/** A bridge answering each mesa command (the words after --json), recording every call. */
export function fakeBridge(answers: Record<string, (args: string[]) => unknown> = {}) {
  const all = { ...HEALTHY, ...answers };
  const calls: string[][] = [];
  const bridge: Bridge = async (args) => {
    calls.push(args);
    // The two-word command first (`vault status`), then the one-word one (`doctor`).
    const answer = all[`${args[1]} ${args[2]}`] ?? all[args[1] ?? ''];
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
}: {
  folder?: string | null;
  file?: string | null;
  terminal?: TerminalHost;
} = {}): Platform & {
  pasteboard: string[];
} => {
  const pasteboard: string[] = [];
  return {
    pickFolder: async () => folder,
    pickFile: async () => file,
    terminal,
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

export const click = (element: HTMLElement | undefined) => act(async () => element?.click());

// Fixtures the screens' tests share: projects, doctor checks, and board rows.

export const PROJECTS: ProjectRow[] = [
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
export const check = (version: string): Check => ({
  name: 'tmux',
  ok: true,
  status: 'ok',
  version,
  hint: '',
});
export const report = (checks: Check[]): DoctorReport => {
  const healthy = checks.every((c) => c.ok);
  const summary = healthy ? 'ready' : 'tmux and at least one agent (claude or codex) are required';
  return { healthy, summary, checks };
};
/** Faro's part of a board row: a middling attention and an empty Decision. */
export const placed = {
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

export type BoardRow = ManagedRow & { depth: number };
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
