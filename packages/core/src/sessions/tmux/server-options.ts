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

/** The view-session option a terminal sets for how many lines one wheel report scrolls. */
export const WHEEL_LINES_OPTION = '@mesa-wheel-lines';
const WHEEL_LINES = `#{?${WHEEL_LINES_OPTION},#{${WHEEL_LINES_OPTION}},5}`;

/**
 * The wheel scrolls tmux's history by the view's `@mesa-wheel-lines`, else tmux's 5: the app's
 * terminal sets 1, so a trackpad moves one row per report (docs/spikes/terminal-scrolling.md).
 * The root binding is tmux's own condition, and its first report scrolls as it enters copy mode.
 */
export const WHEEL_BINDINGS = [
  ...['copy-mode', 'copy-mode-vi'].flatMap((table) =>
    (['Up', 'Down'] as const).flatMap((way) => [
      ';',
      'bind-key',
      '-T',
      table,
      `Wheel${way}Pane`,
      'select-pane',
      '\\;',
      'send-keys',
      '-X',
      '-N',
      WHEEL_LINES,
      `scroll-${way.toLowerCase()}`,
    ]),
  ),
  ';',
  'bind-key',
  '-T',
  'root',
  'WheelUpPane',
  'if-shell',
  '-F',
  '#{||:#{alternate_on},#{pane_in_mode},#{mouse_any_flag}}',
  'send-keys -M',
  `copy-mode -e ; send-keys -X -N '${WHEEL_LINES}' scroll-up`,
];

// Set on every start, before any window exists: history-limit applies only to panes made after it.
export const SERVER_OPTIONS = [
  // Mesa's server outlives its last window, so the options below hold for the next open.
  ['-s', 'exit-empty', 'off'],
  // claude warns when focus events are off.
  ['-s', 'focus-events', 'on'],
  ['-g', 'remain-on-exit', 'on'],
  ['-g', 'history-limit', '10000'],
  ['-g', 'default-terminal', 'tmux-256color'],
  // The app's embedded terminal (ADR-0007 amendment, SP-3): the wheel
  // scrolls tmux's history instead of sending arrow keys to the agent, and no status row. A
  // copy goes out as OSC 52 (to the app) and, through COPY_BINDINGS, to pbcopy.
  // ponytail: no allow-passthrough (pane output could write the pasteboard) and no RGB claim
  // (Terminal.app shares xterm-256color); 256 colours until the app's pty gets its own TERM.
  ['-g', 'mouse', 'on'],
  ['-g', 'status', 'off'],
  ['-s', 'set-clipboard', 'external'],
];
