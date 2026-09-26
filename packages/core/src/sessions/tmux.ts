import { type Env, type Runner, shellWord } from '../process.js';
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
  /** How it exited, once dead: its exit status, or the signal that killed it (`kill`). */
  deadStatus?: number;
  deadSignal?: string;
};

export type WindowSpec = WindowTarget & {
  cwd: string;
  /**
   * One simple command for POSIX sh, run as `/bin/sh -c`, never through the user's shell: Mesa
   * quotes for sh (a goal is one shellWord), and fish or tcsh read quotes differently. sh then
   * execs it, so the pane's pid is the agent's; a list or a redirect would leave sh in between.
   * The agent gets the tmux server's environment and the window's variables, and no shell
   * startup file.
   */
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
  'pane_dead_status',
  'pane_dead_signal',
]
  .map((f) => `#{${f}}`)
  .join('\t');

/**
 * With `mouse on`, a drag selects in tmux's copy mode; ending it pipes the text to pbcopy, so a
 * copy reaches the pasteboard in every client, Terminal.app too (it ignores OSC 52).
 */
const COPY_BINDINGS = ['copy-mode', 'copy-mode-vi'].flatMap((table) => [
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
const SERVER_OPTIONS = [
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

/** The name prefix of a terminal's view session (attachArgv): never a project's session. */
export const VIEW_PREFIX = '_view-';

/** What a Claude Code parent leaves in the environment; a claude started with them thinks it is nested. */
const nestedAgentVars = (env: Env) =>
  Object.keys(env).filter(
    (name) => name === 'CLAUDECODE' || name === 'CLAUDE_PID' || name.startsWith('CLAUDE_CODE_'),
  );

const SHELL_NAMES = /^-?(sh|bash|zsh|fish|dash|ksh|tcsh|csh)$/;
/** A pane whose current command is a shell: its agent is gone. */
export const isShell = (command: string) => SHELL_NAMES.test(command);
/** tmux's answers when there is nothing to list; `no current target` is a server with no sessions. */
const NOTHING_THERE = /no server running|error connecting to|can't find session|no current target/;

// `=` asks for an exact name: tmux otherwise takes a prefix, so `tide` would reach `tide-pool`.
const exact = ({ project, window }: WindowTarget) => `=${project}:=${window}`;
/** `project:window`, as tmux itself names the window. */
export const targetLabel = ({ project, window }: WindowTarget) => `${project}:${window}`;
const label = targetLabel;

function parseWindow(line: string): TmuxWindow {
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

/**
 * The tmux command a pane-died hook runs: `mesa --profile <profile> hook tmux pane-died -- <project>
 * <window>`, the pane's names filled in, shell-quoted, by tmux when it fires (`#{q:...}`). Three
 * parsers read it. For the shell, this mesa's words are single-quoted. For tmux's formats, a `#`
 * in them is doubled. For tmux's double quotes, a backslash, a quote, and a `$` are escaped.
 * `-b`: tmux runs each hook in the background, so one slow hook never holds up the next pane's.
 * Its output and any failure are dropped: tmux shows a background command's output, or a
 * nonzero status, in view mode on some other pane, which would freeze a live agent's screen.
 */
function paneDiedHook(self: readonly string[], profile: string): string {
  const mesa = [...self.map(shellWord), '--profile', shellWord(profile)].join(' ');
  const command = `${mesa.replaceAll('#', '##')} hook tmux pane-died -- #{q:session_name} #{q:window_name} >/dev/null 2>&1 || :`;
  return `run-shell -b "${command.replace(/[\\"$]/g, (c) => `\\${c}`)}"`;
}

export function tmuxBackend({
  run,
  socket,
  env,
  paneDied,
}: {
  run: Runner;
  socket: string;
  env: Env;
  /** This mesa and its profile, for the pane-died hook; tests leave it out. */
  paneDied?: { self: readonly string[]; profile: string };
}) {
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

  /** Every window on the server, or one project's; none when the server or project is absent. */
  const listWindows = async (project?: string): Promise<TmuxWindow[]> => {
    const scope = project ? ['-t', `=${project}`] : ['-a'];
    const res = await tmux(['list-windows', ...scope, '-F', FORMAT]);
    if (!res.ok) {
      if (NOTHING_THERE.test(res.detail)) return [];
      throw new MesaError('internal', `could not list tmux windows: ${res.detail}`);
    }
    // A terminal's view session repeats its project's windows: they are listed once, as the project's.
    return res.stdout
      .split('\n')
      .filter(Boolean)
      .map(parseWindow)
      .filter((w) => !w.project.startsWith(VIEW_PREFIX));
  };

  const ensureServer = async () => {
    const options = SERVER_OPTIONS.flatMap((o) => [';', 'set-option', ...o]);
    const unset = nestedAgentVars(env).flatMap((name) => [';', 'set-environment', '-gu', name]);
    // One global hook: set-hook -g replaces the hook's whole list, so starting again leaves one.
    const hook = paneDied
      ? [';', 'set-hook', '-g', 'pane-died', paneDiedHook(paneDied.self, paneDied.profile)]
      : [];
    await must(
      ['start-server', ...options, ...COPY_BINDINGS, ...unset, ...hook],
      'internal',
      'could not start tmux',
    );
  };

  return {
    /** Starts the profile's server, or updates it, with Mesa's options and its pane-died hook. */
    ensureServer,
    /**
     * Whether a server runs on the profile's socket, and whether it has exactly this mesa's
     * pane-died hook: one that runs a mesa that moved counts as missing, as a stale Claude hook
     * does. No tmux reads as no server.
     */
    paneDiedHookState: async () => {
      const res = await tmux(['show-hooks', '-g', 'pane-died']).catch(() => undefined);
      if (!res?.ok) return { server: false, paneDied: false };
      const expected = paneDied && `pane-died[0] ${paneDiedHook(paneDied.self, paneDied.profile)}`;
      const set = res.stdout.split('\n').filter((line) => line.startsWith('pane-died['));
      return { server: true, paneDied: set.length === 1 && set[0] === expected };
    },
    /**
     * Sets the pane-died hook on a running server, without starting one: a board look keeps a
     * server from an older mesa hooked. ensureServer sets it with everything else.
     */
    setPaneDiedHook: async () => {
      if (!paneDied) return;
      await tmux(['set-hook', '-g', 'pane-died', paneDiedHook(paneDied.self, paneDied.profile)]);
    },
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
        // Several words: tmux runs them as they are, not through default-shell. sh execs a lone
        // command, so the pane's pid is the agent's, which the listing matches on.
        [
          ...where,
          '-n',
          spec.window,
          '-c',
          spec.cwd,
          ...vars,
          '/bin/sh',
          '-c',
          spec.command,
          ...unset,
        ],
        'internal',
        `could not open ${label(spec)}`,
      );
      return { project: spec.project, window: spec.window };
    },
    /**
     * Sizes the window to a view's cols and rows now, then hands sizing back to tmux's own
     * `window-size latest` (resize-window alone would pin it): after that the client used last
     * sizes the window (ADR-0001 amendment).
     */
    resizeWindow: async (target: WindowTarget, cols: number, rows: number) => {
      await onWindow(
        target,
        'resize-window',
        '-x',
        String(cols),
        '-y',
        String(rows),
        ';',
        'set-option',
        '-w',
        '-t',
        exact(target),
        '-u',
        'window-size',
      );
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
      // `--` so text starting with `-` is typed, not read as a flag. tmux reads any word ending in
      // `;` as the end of a command and turns a closing `\;` into `;`, so a closing `;` goes as `\;`.
      const word = text.endsWith(';') ? `${text.slice(0, -1)}\\;` : text;
      await onWindow(target, 'send-keys', '-l', '--', word);
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
    listWindows,
    /**
     * The argv that shows the window in a terminal, run by the caller in its own terminal. Each
     * terminal gets its own view: a session grouped with the project's (same windows, its own
     * current window) that tmux destroys when the terminal detaches. Attaching to the project's
     * session itself would switch every attached terminal to this window (ADR-0001 amendment).
     */
    attachArgv: (target: WindowTarget, view: string) => [
      'tmux',
      '-L',
      socket,
      '-f',
      '/dev/null',
      'new-session',
      '-t',
      `=${target.project}`,
      '-s',
      `${VIEW_PREFIX}${view}`,
      ';',
      'set-option',
      'destroy-unattached',
      'on',
      ';',
      'select-window',
      '-t',
      `=${VIEW_PREFIX}${view}:=${target.window}`,
    ],
    /** The window itself, with its pane's state; undefined when it is gone. */
    findWindow: async (target: WindowTarget) =>
      (await listWindows(target.project)).find((w) => w.window === target.window),
    windowExists: async (target: WindowTarget) =>
      (await tmux(['list-panes', '-t', exact(target), '-F', '#{pane_id}'])).ok,
  };
}

export type TmuxBackend = ReturnType<typeof tmuxBackend>;
