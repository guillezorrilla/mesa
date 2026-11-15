import type {
  BrowserHost,
  ChatFollowHost,
  FileDrop,
  Platform,
  TerminalHost,
  UpdateHost,
  UpdateStatus,
} from '../platform';

/** The updater in memory: `push` plays a status, and every action is recorded. */
export function fakeUpdates(initial: Partial<UpdateStatus> = {}) {
  const calls: string[] = [];
  let status: UpdateStatus = {
    phase: 'idle',
    version: null,
    channel: 'beta',
    message: null,
    page: 'https://github.com/guillezorrilla/mesa/releases',
    revoked: null,
    dismissed: false,
    ...initial,
  };
  const listeners = new Set<(status: UpdateStatus) => void>();
  const push = (change: Partial<UpdateStatus>) => {
    status = { ...status, ...change };
    for (const listener of listeners) listener(status);
  };
  const host: UpdateHost = {
    status: async () => status,
    onStatus: async (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    check: async () => void calls.push('check'),
    later: async () => {
      calls.push('later');
      push({ dismissed: true });
    },
    install: async () => void calls.push('install'),
    openPage: async () => void calls.push('openPage'),
    quit: async () => void calls.push('quit'),
  };
  return { host, calls, push };
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

/** Rust's chat follows: `push` prints one `mesa chat --follow` line on the open follow. */
export function fakeFollows() {
  const calls: (string | number)[][] = [];
  const lines = new Map<string, (line: string) => void>();
  const exits = new Map<string, () => void>();
  let next = 0;
  const host: ChatFollowHost = {
    open: async (sessionId, count) => {
      calls.push(['open', sessionId, count]);
      next += 1;
      return `f${next}`;
    },
    onLine: async (followId, listener) => {
      lines.set(followId, listener);
      return () => lines.delete(followId);
    },
    onExit: async (followId, listener) => {
      exits.set(followId, listener);
      return () => exits.delete(followId);
    },
    ready: async (followId) => void calls.push(['ready', followId]),
    close: async (followId) => void calls.push(['close', followId]),
  };
  /** The open follow ends for good, as a stopped host's does. */
  const exit = () => {
    for (const listener of exits.values()) listener();
  };
  const push = (line: object) => {
    for (const listener of lines.values()) listener(JSON.stringify(line));
  };
  return { host, calls, push, exit };
}

/** The Rust watcher on `sessions/events/`: `push` plays one debounced change. */
export function fakeSessionEvents() {
  const listeners = new Set<() => void>();
  const host: Platform['sessions'] = {
    onChanged: async (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    host,
    push: () => {
      for (const listener of listeners) listener();
    },
  };
}

/** Files dropped on the window, handed to every terminal listening. */
export function fakeFileDrops() {
  const listeners = new Set<(drop: FileDrop) => void>();
  const host: Platform['fileDrops'] = {
    onDrop: async (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    host,
    push: (drop: FileDrop) => {
      for (const listener of listeners) listener(drop);
    },
  };
}

/** A platform whose pickers return `folder` and `file` (none: the user cancelled), recording
 * the pasteboard, each Dock badge count, and each profile switched to. */
export const fakePlatform = ({
  folder = null,
  file = null,
  terminal = fakeTerminals().host,
  follow = fakeFollows().host,
  browser = {
    owner: async () => ({ pid: 42, socket: '/tmp/mesa-browser-42.sock' }),
    open: async () => 'browser-test',
    navigate: async () => {},
    bounds: async () => {},
    hide: async () => {},
    show: async () => {},
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
  updates = fakeUpdates().host,
  menu = { onAbout: async () => () => {} },
  fileDrops = fakeFileDrops().host,
  sessions = fakeSessionEvents().host,
}: {
  folder?: string | null;
  file?: string | null;
  terminal?: TerminalHost;
  follow?: ChatFollowHost;
  browser?: BrowserHost;
  deepLinks?: Platform['deepLinks'];
  notifications?: Platform['notifications'];
  lifecycle?: Platform['lifecycle'];
  updates?: UpdateHost;
  menu?: Platform['menu'];
  fileDrops?: Platform['fileDrops'];
  sessions?: Platform['sessions'];
} = {}): Platform & {
  pasteboard: string[];
  badges: number[];
  /** Each hold and release the app asked for, in order. */
  awake: Platform['awake'] & { calls: ('hold' | 'release')[] };
  switched: string[];
} => {
  const pasteboard: string[] = [];
  const badges: number[] = [];
  const awake: ('hold' | 'release')[] = [];
  const switched: string[] = [];
  return {
    lifecycle,
    pickFolder: async () => folder,
    pickFile: async () => file,
    deepLinks,
    notifications,
    terminal,
    follow,
    browser,
    fileDrops,
    sessions,
    clipboard: { write: async (text) => void pasteboard.push(text) },
    pasteboard,
    dock: { badge: async (count) => void badges.push(count) },
    badges,
    awake: {
      hold: async () => void awake.push('hold'),
      release: async () => void awake.push('release'),
      calls: awake,
    },
    updates,
    menu,
    profiles: { switch: async (name) => void switched.push(name) },
    switched,
  };
};
