import type { BrowserHost, Platform, TerminalHost } from '../platform';

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

/** A platform whose pickers return `folder` and `file` (none: the user cancelled), recording
 * the pasteboard and each Dock badge count. */
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
  badges: number[];
} => {
  const pasteboard: string[] = [];
  const badges: number[] = [];
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
    dock: { badge: async (count) => void badges.push(count) },
    badges,
  };
};
