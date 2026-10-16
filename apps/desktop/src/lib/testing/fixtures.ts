import type {
  Check,
  DiffRow,
  DoctorReport,
  ForeignRow,
  ImpactReport,
  ManagedRow,
  NativeResponse,
  ProjectRow,
} from '@mesa/core';
import { envelope } from './replies';

// Fixtures the screens' tests share: projects, doctor checks, board rows, and session replies.

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
    sessionOrder: [],
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
    sessionOrder: [],
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
  supervision: { source: 'rules' },
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

/** One of session aaaaaaaa's replies as `mesa review responses` lists it, its source `source` x64. */
export const nativeResponse = (
  text: string,
  source: string,
  extra: Partial<NativeResponse> = {},
): NativeResponse => ({
  profile: 'default',
  session: 'aaaaaaaa',
  agent: 'claude',
  nativeSessionId: 'invented-native-id',
  source: source.repeat(64),
  revision: 'f'.repeat(64),
  text,
  blocks: [],
  truncated: false,
  ...extra,
});

/** An Impact report (`mesa impact --json`) with nothing in it unless `extra` says so. */
export const impactReport = (extra: Partial<ImpactReport> = {}): ImpactReport => ({
  days: 7,
  since: '2026-10-06T12:00:00.000Z',
  summary: { caught: 0, corrected: 0, notesIn: 0, stopped: 0, kept: 0, sessions: 0 },
  sentence: 'Nothing yet.',
  sessions: [],
  ...extra,
});

/** A diff's meta line (a file header, a hunk mark), as the diff views receive it. */
export const diffMeta = (left: string): DiffRow => ({ kind: 'meta', left, right: left });

/** Two changed files: src/tide.ts (one line changed, one kept) and a new notes.txt of two lines. */
export const TWO_FILE_DIFF: DiffRow[] = [
  diffMeta('diff --git a/src/tide.ts b/src/tide.ts'),
  diffMeta('@@ -1,2 +1,2 @@'),
  { kind: 'context', left: 'const sea = 1;', right: 'const sea = 1;', oldLine: 1, newLine: 1 },
  { kind: 'change', left: 'low', right: 'high', oldLine: 2, newLine: 2 },
  diffMeta('diff --git a/notes.txt b/notes.txt'),
  diffMeta('new file mode 100644'),
  diffMeta('@@ -0,0 +1,2 @@'),
  { kind: 'change', left: '', right: 'gull', newLine: 1 },
  { kind: 'change', left: '', right: 'kelp', newLine: 2 },
];

/** A session's changes as `mesa diff` answers, over TWO_FILE_DIFF unless `data` says otherwise. */
export const sessionDiff = (data: object = {}) =>
  envelope({
    checkout: { project: 'lantern-cove', path: '/w/reef', registered: false },
    branch: 'session/reef',
    base: 'main',
    mergeBase: 'abc',
    ahead: 2,
    omitted: 0,
    rows: TWO_FILE_DIFF,
    ...data,
  });
