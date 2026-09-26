import type {
  Config,
  DoctorReport,
  HooksStatus,
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
      tmux: { socket: 'mesa-default', paneDied: true },
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

/** A platform whose folder picker returns `folder` (null: the user cancelled). */
export const fakePlatform = (
  folder: string | null = null,
  terminal: TerminalHost = fakeTerminals().host,
): Platform & { pasteboard: string[] } => {
  const pasteboard: string[] = [];
  return {
    pickFolder: async () => folder,
    terminal,
    clipboard: { write: async (text) => void pasteboard.push(text) },
    pasteboard,
  };
};

/** Renders `ui` inside the same MesaRoot main.tsx uses, over fakes; returns a test-id query. */
let mounted: Root | undefined;

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
  return (id: string) => [...root.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
}

export const click = (element: HTMLElement | undefined) => act(async () => element?.click());
