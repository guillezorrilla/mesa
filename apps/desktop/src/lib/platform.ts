import type { DeliveryPlan } from '@mesa/core';

export type NativeNotice = Exclude<DeliveryPlan, { kind: 'none' }>;
export type NotificationStatus = {
  authorization:
    | 'not-determined'
    | 'denied'
    | 'authorized'
    | 'provisional'
    | 'ephemeral'
    | 'unknown';
  alertsEnabled: boolean;
  soundsEnabled: boolean;
};

/** A terminal the app runs on a session's tmux window (Rust `term_*`, ADR-0007). */
export type TerminalHost = {
  /** Attaches a new terminal of `cols` x `rows` to the session's window; resolves its id. */
  open: (sessionId: string, cols: number, rows: number) => Promise<string>;
  write: (termId: string, data: string) => Promise<void>;
  /** The terminal's own size; the window follows with `mesa resize`. */
  resize: (termId: string, cols: number, rows: number) => Promise<void>;
  /** Ends the terminal's tmux client; the window and its agent keep running. */
  close: (termId: string) => Promise<void>;
  /** Output as it comes, and the end of the attach; each returns its unsubscribe. */
  onData: (termId: string, listener: (bytes: Uint8Array) => void) => Promise<() => void>;
  onExit: (termId: string, listener: () => void) => Promise<() => void>;
  /** The listeners are in place: output held since open is sent, then the rest as it comes. */
  ready: (termId: string) => Promise<void>;
};

/** What the app asks of the OS itself, apart from mesa: dialogs, terminals, the pasteboard. A seam like the bridge. */
export type Platform = {
  /** A folder the user picks, or null when they cancel. */
  pickFolder: () => Promise<string | null>;
  /** A file the user picks (a handoff note), or null when they cancel. */
  pickFile: () => Promise<string | null>;
  deepLinks: {
    current: () => Promise<string[] | null>;
    onOpen: (handler: (urls: string[]) => void) => Promise<() => void>;
  };
  notifications: {
    status: () => Promise<NotificationStatus>;
    requestPermission: () => Promise<NotificationStatus>;
    send: (notice: NativeNotice) => Promise<void>;
    onOpen: (handler: (target: NativeNotice['target']) => void) => Promise<() => void>;
  };
  terminal: TerminalHost;
  /** The macOS pasteboard, through Rust: WKWebView refuses `navigator.clipboard` (SP-3). Paste
   * needs no seam: Cmd+V fires a paste event that xterm handles. */
  clipboard: { write: (text: string) => Promise<void> };
};
