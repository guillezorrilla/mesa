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
};

/** What the app asks of the OS itself, apart from mesa: native dialogs. A seam like the bridge. */
export type Platform = {
  /** A folder the user picks, or null when they cancel. */
  pickFolder: () => Promise<string | null>;
  terminal: TerminalHost;
  /** The macOS pasteboard, through Rust: WKWebView refuses `navigator.clipboard` (SP-3). */
  clipboard: { write: (text: string) => Promise<void>; read: () => Promise<string> };
};
