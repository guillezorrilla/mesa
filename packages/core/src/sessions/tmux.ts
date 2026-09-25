import type { Env, Runner } from '../process.js';
import { type ErrorCode, MesaError } from '../result.js';

// The session backend: ADR-0001's tmux commands on the profile's own socket, never the user's
// tmux server. Command lines and options follow docs/spikes/session-ids.md.

const TIMEOUT_MS = 5000;
export const TMUX_INSTALL = 'brew install tmux';

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
};

export type WindowSpec = WindowTarget & {
  cwd: string;
  /** Run by tmux through the default shell. */
  command: string;
  /** Set in the window's environment: `MESA_SESSION_ID` and `MESA_PROFILE` for the hooks. */
  env: Record<string, string>;
};

// ADR-0001's list format, with the session name first for `-a`. Tabs, so a path may hold spaces.
const FORMAT = [
  'session_name',
  'window_index',
  'window_name',
  'pane_pid',
  'pane_current_command',
  'pane_current_path',
  'window_activity',
  'pane_dead',
]
  .map((f) => `#{${f}}`)
  .join('\t');

// Set on every start, before any window exists: history-limit applies only to panes made after it.
const SERVER_OPTIONS = [
  // Mesa's server outlives its last window, so the options below hold for the next open.
  ['-s', 'exit-empty', 'off'],
  // claude warns when focus events are off.
  ['-s', 'focus-events', 'on'],
  ['-g', 'remain-on-exit', 'on'],
  ['-g', 'history-limit', '10000'],
  ['-g', 'default-terminal', 'tmux-256color'],
];

/** What a Claude Code parent leaves in the environment; a claude started with them thinks it is nested. */
const nestedAgentVars = (env: Env) =>
  Object.keys(env).filter(
    (name) => name === 'CLAUDECODE' || name === 'CLAUDE_PID' || name.startsWith('CLAUDE_CODE_'),
  );

const SHELL_NAMES = /^-?(sh|bash|zsh|fish|dash|ksh|tcsh|csh)$/;
/** tmux's answers when there is nothing to list; `no current target` is a server with no sessions. */
const NOTHING_THERE = /no server running|error connecting to|can't find session|no current target/;

// `=` asks for an exact name: tmux otherwise takes a prefix, so `tide` would reach `tide-pool`.
const exact = ({ project, window }: WindowTarget) => `=${project}:=${window}`;
/** `project:window`, as tmux itself names the window. */
export const targetLabel = ({ project, window }: WindowTarget) => `${project}:${window}`;
const label = targetLabel;

function parseWindow(line: string): TmuxWindow {
  const [project = '', index, window = '', pid, command = '', path = '', activity, dead] =
    line.split('\t');
  return {
    project,
    window,
    index: Number(index),
    panePid: Number(pid),
    command,
    path,
    activity: new Date(Number(activity) * 1000).toISOString(),
    dead: dead === '1',
  };
}

export function tmuxBackend({ run, socket, env }: { run: Runner; socket: string; env: Env }) {
  /** One tmux call on Mesa's socket. A missing or hung tmux throws; a failed command returns. */
  const tmux = async (args: string[]) => {
    // -f /dev/null: the user's tmux.conf never shapes Mesa's server (ADR-0001 amendment).
    const res = await run('tmux', ['-L', socket, '-f', '/dev/null', ...args], TIMEOUT_MS);
    if (res.ok || res.reason === 'failed') return res;
    throw new MesaError(
      'tmux_unavailable',
      res.reason === 'missing'
        ? `tmux not found on PATH; install with \`${TMUX_INSTALL}\``
        : `tmux did not answer within ${TIMEOUT_MS / 1000} s`,
    );
  };
  /** A tmux call that must succeed: its failure throws `code` with tmux's own message. */
  const must = async (args: string[], code: ErrorCode, what: string) => {
    const res = await tmux(args);
    if (!res.ok) throw new MesaError(code, `${what}: ${res.detail}`);
    return res.stdout;
  };
  /** `command` on one window; a missing window is not_found. */
  const onWindow = (target: WindowTarget, command: string, ...rest: string[]) =>
    must([command, '-t', exact(target), ...rest], 'not_found', `no window ${label(target)}`);

  const ensureServer = async () => {
    const options = SERVER_OPTIONS.flatMap((o) => [';', 'set-option', ...o]);
    const unset = nestedAgentVars(env).flatMap((name) => [';', 'set-environment', '-gu', name]);
    await must(['start-server', ...options, ...unset], 'internal', 'could not start tmux');
  };

  return {
    /** Starts the profile's server, or updates it, with Mesa's options. */
    ensureServer,
    /** A window in the project's tmux session, which is created with it when missing. */
    openWindow: async (spec: WindowSpec): Promise<WindowTarget> => {
      await ensureServer();
      const hasSession = (await tmux(['has-session', '-t', `=${spec.project}`])).ok;
      const where = hasSession
        ? ['new-window', '-d', '-t', `=${spec.project}:`]
        : ['new-session', '-d', '-s', spec.project];
      const vars = Object.entries(spec.env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
      // new-session -e also sets the tmux session's environment, which a window the user adds by
      // hand would inherit; the first window keeps its own copy.
      const unset = hasSession
        ? []
        : Object.keys(spec.env).flatMap((k) => [
            ';',
            'set-environment',
            '-t',
            `=${spec.project}`,
            '-u',
            k,
          ]);
      await must(
        [...where, '-n', spec.window, '-c', spec.cwd, ...vars, spec.command, ...unset],
        'internal',
        `could not open ${label(spec)}`,
      );
      return { project: spec.project, window: spec.window };
    },
    killWindow: async (target: WindowTarget) => {
      await onWindow(target, 'kill-window');
    },
    /**
     * Types `text` literally, then Enter, in a second call. Refuses a pane whose process exited,
     * and one running a shell (the agent is gone) unless `force`.
     */
    sendText: async (target: WindowTarget, text: string, { force = false } = {}) => {
      const pane = await onWindow(
        target,
        'display-message',
        '-p',
        '#{pane_dead}\t#{pane_current_command}',
      );
      const [dead, command = ''] = pane.trim().split('\t');
      if (dead === '1' || (SHELL_NAMES.test(command) && !force)) {
        const why = dead === '1' ? 'its process exited' : `it runs ${command}; force sends anyway`;
        throw new MesaError('agent_unavailable', `no agent in ${label(target)}: ${why}`);
      }
      // `--` so text starting with `-` is typed, not read as a flag.
      await onWindow(target, 'send-keys', '-l', '--', text);
      await onWindow(target, 'send-keys', 'Enter');
    },
    /** Presses one key (`Escape`, `Enter`), not typed as text. */
    pressKey: async (target: WindowTarget, key: string) => {
      await onWindow(target, 'send-keys', key);
    },
    /** The last `lines` lines of the pane, trailing blank lines dropped. */
    capturePane: async (target: WindowTarget, lines: number) => {
      const out = await onWindow(target, 'capture-pane', '-p', '-S', `-${lines}`);
      return out.replace(/\n+$/, '').split('\n').slice(-lines).join('\n');
    },
    /** Every window on the server, or one project's; none when the server or project is absent. */
    listWindows: async (project?: string): Promise<TmuxWindow[]> => {
      const scope = project ? ['-t', `=${project}`] : ['-a'];
      const res = await tmux(['list-windows', ...scope, '-F', FORMAT]);
      if (!res.ok) {
        if (NOTHING_THERE.test(res.detail)) return [];
        throw new MesaError('internal', `could not list tmux windows: ${res.detail}`);
      }
      return res.stdout.split('\n').filter(Boolean).map(parseWindow);
    },
    /** The argv that attaches a terminal to the window: run by the caller, in its own terminal. */
    attachArgv: (target: WindowTarget) => [
      'tmux',
      '-L',
      socket,
      '-f',
      '/dev/null',
      'attach-session',
      '-t',
      exact(target),
      // ADR-0001: the app and a user terminal never fight over the pane size.
      '-f',
      'ignore-size',
    ],
    windowExists: async (target: WindowTarget) =>
      (await tmux(['list-panes', '-t', exact(target), '-F', '#{pane_id}'])).ok,
  };
}

export type TmuxBackend = ReturnType<typeof tmuxBackend>;
