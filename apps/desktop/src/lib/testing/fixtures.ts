import type { Check, DoctorReport, ForeignRow, ManagedRow, ProjectRow } from '@mesa/core';

// Fixtures the screens' tests share: projects, doctor checks, and board rows.

export const PROJECTS: ProjectRow[] = [
  {
    name: 'lantern-cove',
    label: 'lantern-cove',
    path: '/src/lantern-cove',
    agent: 'claude',
    priority: 0.5,
    skills: [],
    overrides: {},
    terminalTheme: 'follow',
    unapproved: {},
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
    overrides: {},
    terminalTheme: null,
    unapproved: {},
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
