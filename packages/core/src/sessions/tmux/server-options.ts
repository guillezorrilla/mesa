// The options Mesa's tmux server starts with (ADR-0001 amendment, SP-3).

/**
 * With `mouse on`, a drag selects in tmux's copy mode; ending it pipes the text to pbcopy, so a
 * copy reaches the pasteboard in every client, Terminal.app too (it ignores OSC 52).
 */
export const COPY_BINDINGS = ['copy-mode', 'copy-mode-vi'].flatMap((table) => [
  ';',
  'bind-key',
  '-T',
  table,
  'MouseDragEnd1Pane',
  'send-keys',
  '-X',
  'copy-pipe-and-cancel',
  'pbcopy',
]);

// Set on every start, before any window exists: history-limit applies only to panes made after it.
export const SERVER_OPTIONS = [
  // Mesa's server outlives its last window, so the options below hold for the next open.
  ['-s', 'exit-empty', 'off'],
  // claude warns when focus events are off.
  ['-s', 'focus-events', 'on'],
  ['-g', 'remain-on-exit', 'on'],
  ['-g', 'history-limit', '10000'],
  ['-g', 'default-terminal', 'tmux-256color'],
  // The app's embedded terminal (ADR-0007 amendment, SP-3), as the reference app sets its sessions: the wheel
  // scrolls tmux's history instead of sending arrow keys to the agent, and no status row. A
  // copy goes out as OSC 52 (to the app) and, through the bindings below, to pbcopy.
  // ponytail: no allow-passthrough (pane output could write the pasteboard) and no RGB claim
  // (Terminal.app shares xterm-256color); 256 colours until the app's pty gets its own TERM.
  ['-g', 'mouse', 'on'],
  ['-g', 'status', 'off'],
  ['-s', 'set-clipboard', 'external'],
];
