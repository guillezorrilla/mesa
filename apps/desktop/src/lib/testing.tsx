import type {
  Check,
  Config,
  DoctorReport,
  ForeignRow,
  GuardrailCheck,
  HooksStatus,
  ManagedRow,
  ProfileInfo,
  ProjectRow,
  ReceiptEntry,
  SessionRow,
  SkillRow,
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
  profile: () => envelope({ profile: 'default', dir: '/h/.mesa/default' } satisfies ProfileInfo),
  config: () =>
    envelope({
      vault: '/h/vault',
      defaultAgent: 'claude',
      skills: [],
      decisions: { backend: 'adapter', threshold: 0.7 },
      sessions: { log: true },
      terminal: { app: 'Terminal' },
      run: { permissionMode: 'acceptEdits', allowedTools: [] },
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
      codex: {
        path: '/h/.codex/hooks.json',
        installed: true,
        stale: false,
        events: {},
        trusted: {},
        hint: '',
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
    path: '/src/lantern-cove',
    agent: 'claude',
    priority: 0.5,
    skills: [],
    exists: true,
  },
  { name: 'tide', path: '/src/tide', agent: null, priority: null, skills: [], exists: false },
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

/** Skills a project sees, as `mesa skills list <project>` prints them: two enabled, one not. */
export const SKILLS: SkillRow[] = [
  {
    name: 'session-summary',
    source: 'mesa',
    enabled: true,
    description: 'Summarise what a session did into the vault',
  },
  { name: 'mesa-handoff', source: 'mesa', enabled: false, description: 'Hand a session off' },
  { name: 'tidy-readme', source: 'repo', enabled: true, description: 'Tidy the README' },
];

type Receipt = ReceiptEntry['receipt'];
/** A receipt as `mesa receipts --json` lists it and `mesa receipts show` prints it. */
const receiptEntry = (receipt: Receipt, summary: string): ReceiptEntry => ({
  path: `receipts/2026/09/${receipt.started.replace(/[-:]/g, '')}00Z-${receipt.type}-${receipt.id}.md`,
  receipt,
  summary,
  body: `${summary}\n\n## Details\n\nNone.\n`,
});

/** A skill run on a strict project, which the guardrail asked about and `--yes` let through. */
export const RUN_RECEIPT = receiptEntry(
  {
    type: 'skill',
    id: '01TEST00000000000000000003',
    profile: 'default',
    project: 'lantern-cove',
    session: 'eeeeeeee',
    agent: 'claude',
    started: '2026-09-25T12:05',
    ended: '2026-09-25T12:06',
    status: 'ok',
    cost: 0.042,
    command: 'mesa run --project lantern-cove --yes -- tidy-readme "focus on tests"',
    decisions: [
      {
        question: 'verdict',
        kind: 'Choice',
        answer: 'ask',
        probabilities: { allow: 0.04, ask: 0.95, block: 0.01 },
        confidence: 0.95,
        backend: 'rules',
      },
      {
        question: 'secret-or-destructive',
        kind: 'Noul',
        answer: false,
        probabilities: 0.05,
        backend: 'rules',
      },
    ],
    inputs: {
      skill: 'tidy-readme',
      project: 'lantern-cove',
      agent: 'claude',
      args: ['focus on tests'],
      yes: true,
    },
    outputs: { window: 'claude-eeeeeeee', state: 'done', durationMs: 61_000, override: 'yes' },
  },
  'Ran skill tidy-readme on lantern-cove as session eeeeeeee',
);
/** A session opened on the Board. */
export const SESSION_RECEIPT = receiptEntry(
  {
    type: 'session',
    id: '01TEST00000000000000000002',
    profile: 'default',
    project: 'lantern-cove',
    session: 'bbbbbbbb',
    agent: 'claude',
    started: '2026-09-25T12:00',
    ended: '2026-09-25T12:03',
    status: 'ok',
    command: 'mesa open --no-parent --agent claude -- lantern-cove',
    decisions: [],
    inputs: { project: 'lantern-cove', agent: 'claude' },
    outputs: { window: 'claude-bbbbbbbb' },
  },
  'Opened session bbbbbbbb on lantern-cove',
);
/** A project registered, which failed. */
export const ACTION_RECEIPT = receiptEntry(
  {
    type: 'action',
    id: '01TEST00000000000000000001',
    profile: 'default',
    started: '2026-09-25T11:58',
    status: 'failed',
    command: 'mesa register --create -- /src/tide',
    decisions: [],
    inputs: { dir: '/src/tide', create: true },
    outputs: { error: { code: 'not_found', message: 'no folder /src/tide' } },
  },
  'Could not register /src/tide',
);
/** The three receipts, newest first. */
export const RECEIPTS = [RUN_RECEIPT, SESSION_RECEIPT, ACTION_RECEIPT];

/**
 * Answers for `mesa receipts` (newest first, of its --type and --session) and `mesa receipts
 * show <id>`, over `entries`.
 */
export const receiptAnswers = (entries: ReceiptEntry[] = RECEIPTS) => ({
  receipts: (args: string[]) => {
    const type = args[args.indexOf('--type') + 1];
    const session = args.find((a) => a.startsWith('--session='))?.slice('--session='.length);
    return envelope(
      entries.filter(
        (e) =>
          (!args.includes('--type') || e.receipt.type === type) &&
          (session === undefined || e.receipt.session === session),
      ),
    );
  },
  'receipts show': (args: string[]) => {
    const entry = entries.find((e) => e.receipt.id === args.at(-1));
    return entry ? envelope(entry) : failure(`no receipt with id ${args.at(-1)}`);
  },
});
