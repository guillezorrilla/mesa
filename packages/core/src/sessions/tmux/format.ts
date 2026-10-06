// How Mesa names and reads tmux windows: targets, the list format, and what a pane runs.

/** One window on Mesa's server: the project names the tmux session, the window one agent session. */
export type WindowTarget = { project: string; window: string };

export type TmuxWindow = WindowTarget & {
  index: number;
  panePid: number;
  /** What the pane runs now: claude shows as its version string (`2.1.282`), a shell as `zsh`. */
  command: string;
  path: string;
  /** Last activity in the window, ISO. */
  activity: string;
  /** The process exited; `remain-on-exit` keeps the pane and its output. */
  dead: boolean;
  /** How it exited, once dead: its exit status, or the signal that killed it (`kill`). */
  deadStatus?: number;
  deadSignal?: string;
};

/** How a dead pane's process exited, as a record's `exited` event keeps it; none while it lives. */
export const paneExit = (pane?: Pick<TmuxWindow, 'dead' | 'deadStatus' | 'deadSignal'>) =>
  pane?.dead
    ? {
        ...(pane.deadStatus === undefined ? {} : { status: pane.deadStatus }),
        ...(pane.deadSignal === undefined ? {} : { signal: pane.deadSignal }),
      }
    : {};

// ADR-0001's list format, with the session name first for `-a`. Tabs, so a path may hold spaces.
export const FORMAT = [
  'session_name',
  'window_index',
  'window_name',
  'pane_pid',
  'pane_current_command',
  'pane_current_path',
  'window_activity',
  'pane_dead',
  'pane_dead_status',
  'pane_dead_signal',
]
  .map((f) => `#{${f}}`)
  .join('\t');

/** The name prefix of a terminal's view session (attachArgv): never a project's session. */
export const VIEW_PREFIX = '_view-';

const SHELL_NAMES = /^-?(sh|bash|zsh|fish|dash|ksh|tcsh|csh)$/;
/** A pane whose current command is a shell: its agent is gone. */
export const isShell = (command: string) => SHELL_NAMES.test(command);

// `=` asks for an exact name: tmux otherwise takes a prefix, so `tide` would reach `tide-pool`.
export const exact = ({ project, window }: WindowTarget) => `=${project}:=${window}`;
/**
 * A tmux session by exact name where a command takes a window or pane target (new-window,
 * set-option): those need the trailing `:`, as tmux 3.7 answers a bare `=<session>` with
 * "no such session".
 */
export const sessionTarget = (project: string) => `=${project}:`;
/** `project:window`, as tmux itself names the window. */
export const targetLabel = ({ project, window }: WindowTarget) => `${project}:${window}`;

export function parseWindow(line: string): TmuxWindow {
  const [project = '', index, window = '', pid, command = '', path = '', activity, dead, st, sig] =
    line.split('\t');
  // Empty while the pane lives; once dead, tmux prints the status or the signal's name.
  const status = st && /^\d+$/.test(st) ? Number(st) : undefined;
  const signal = sig || undefined;
  return {
    project,
    window,
    index: Number(index),
    panePid: Number(pid),
    command,
    path,
    activity: new Date(Number(activity) * 1000).toISOString(),
    dead: dead === '1',
    ...(status === undefined ? {} : { deadStatus: status }),
    ...(signal === undefined ? {} : { deadSignal: signal }),
  };
}
