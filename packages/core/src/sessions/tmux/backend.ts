import { type Env, type Runner, shellWord } from '../../lib/process.js';
import { type ErrorCode, MesaError } from '../../lib/result.js';
import {
  exact,
  FORMAT,
  isShell,
  parseWindow,
  type TmuxWindow,
  targetLabel,
  VIEW_PREFIX,
  type WindowTarget,
} from './format.js';
import { mesaCommand, paneDiedHook } from './mesa-command.js';
import { COPY_BINDINGS, SERVER_OPTIONS } from './server-options.js';

// The session backend: ADR-0001's tmux commands on the profile's own socket, never the user's
// tmux server. Command lines and options follow docs/spikes/session-ids.md.

const TIMEOUT_MS = 5000;
export const TMUX_INSTALL = 'brew install tmux';

type WindowSpec = WindowTarget & {
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
  /** The file its output is appended to as it prints, in a folder that exists; none: no log. */
  log?: string;
};

/** What a Claude Code parent leaves in the environment; a claude started with them thinks it is nested. */
export const nestedAgentVars = (env: Env) =>
  Object.keys(env).filter(
    (name) => name === 'CLAUDECODE' || name === 'CLAUDE_PID' || name.startsWith('CLAUDE_CODE_'),
  );

/** tmux's answers when there is nothing to list; `no current target` is a server with no sessions. */
const NOTHING_THERE = /no server running|error connecting to|can't find session|no current target/;

export function tmuxBackend({
  run,
  socket,
  env,
  sleep,
  mesa,
}: {
  run: Runner;
  socket: string;
  env: Env;
  /** Waits between typed text and its Enter, for an agent that needs it (sendText). */
  sleep: (ms: number) => Promise<void>;
  /** This mesa and its profile, for what tmux runs back into it (the pane-died hook, runMesaLater); tests leave it out. */
  mesa?: { self: readonly string[]; profile: string };
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
    must([command, '-t', exact(target), ...rest], 'not_found', `no window ${targetLabel(target)}`);

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
    const hook = mesa
      ? [';', 'set-hook', '-g', 'pane-died', paneDiedHook(mesa.self, mesa.profile)]
      : [];
    await must(
      ['start-server', ...options, ...COPY_BINDINGS, ...unset, ...hook],
      'internal',
      'could not start tmux',
    );
  };

  /** Removes a view (openView) no terminal will attach, and the terminals in its panes with it. */
  const closeView = async (view: WindowTarget) => {
    await tmux(['kill-session', '-t', `=${view.project}`]);
  };
  /**
   * The argv that shows the window in a terminal, run by the caller in its own terminal. Each
   * terminal gets its own view: a session grouped with the project's (same windows, its own
   * current window) that tmux destroys when the terminal detaches. Attaching to the project's
   * session itself would switch every attached terminal to this window (ADR-0001 amendment).
   */
  const attachArgv = (target: WindowTarget, view: string) => [
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
  ];
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
      const expected = mesa && `pane-died[0] ${paneDiedHook(mesa.self, mesa.profile)}`;
      const set = res.stdout.split('\n').filter((line) => line.startsWith('pane-died['));
      return { server: true, paneDied: set.length === 1 && set[0] === expected };
    },
    /**
     * Sets the pane-died hook on a running server, without starting one: a board look keeps a
     * server from an older mesa hooked. ensureServer sets it with everything else.
     */
    setPaneDiedHook: async () => {
      if (!mesa) return;
      await tmux(['set-hook', '-g', 'pane-died', paneDiedHook(mesa.self, mesa.profile)]);
    },
    /**
     * Runs this mesa with `args` from the server, `seconds` from now, in the background: work that
     * must outlive the mesa asking for it, as a session stopping itself would be killed half-way
     * by its own stop. Its output and any failure are dropped, as the pane-died hook's are.
     */
    runMesaLater: async (args: readonly string[], seconds: number) => {
      if (!mesa) throw new MesaError('internal', 'this tmux backend has no mesa to run');
      const command = `sleep ${seconds}; ${mesaCommand(mesa.self, mesa.profile, args)} >/dev/null 2>&1 || :`;
      await must(['run-shell', '-b', command], 'internal', 'could not run mesa later');
    },
    /**
     * A window in the project's tmux session, which is created with it when missing; with `log`,
     * its pane's output goes on to that file through `pipe-pane`, from its first byte.
     */
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
      // In the same call, so the pipe is there before tmux reads anything the agent prints. tmux
      // runs it with /bin/sh after expanding its formats: the file is one shell word, `#` doubled.
      const pipe = spec.log
        ? [
            ';',
            'pipe-pane',
            '-o',
            '-t',
            exact(spec),
            `cat >> ${shellWord(spec.log)}`.replaceAll('#', '##'),
          ]
        : [];
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
          ...pipe,
          ...unset,
        ],
        'internal',
        `could not open ${targetLabel(spec)}`,
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
     * Types `text` literally, then Enter, in a second call, `submitDelayMs` later when the agent
     * needs the pause (its entry's). Refuses a pane whose process exited, and one running a shell
     * (the agent is gone) unless `force`.
     */
    sendText: async (
      target: WindowTarget,
      text: string,
      { force = false, submitDelayMs = 0 } = {},
    ) => {
      const pane = await onWindow(
        target,
        'display-message',
        '-p',
        '#{pane_dead}\t#{pane_current_command}',
      );
      const [dead, command = ''] = pane.trim().split('\t');
      // Checked again as it types, after the caller's look: the pane may have changed since.
      if (dead === '1' || (isShell(command) && !force)) {
        const why = dead === '1' ? 'its process exited' : `it runs ${command}; force sends anyway`;
        throw new MesaError('agent_unavailable', `no agent in ${targetLabel(target)}: ${why}`);
      }
      // `--` so text starting with `-` is typed, not read as a flag. tmux reads any word ending in
      // `;` as the end of a command and turns a closing `\;` into `;`, so a closing `;` goes as `\;`.
      const word = text.endsWith(';') ? `${text.slice(0, -1)}\\;` : text;
      await onWindow(target, 'send-keys', '-l', '--', word);
      if (submitDelayMs > 0) await sleep(submitDelayMs);
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
    attachArgv,
    /**
     * Several windows side by side, for one terminal (CONTEXT.md, Project view): a session
     * `_view-<id>` whose one window, `name`, has a pane per target, each a terminal on that
     * target's window with its own view (attachArgv, TMUX unset so tmux lets it nest), laid out
     * by `layout`. Built detached and re-tiled after each split, so every pane has room; a
     * layout tmux does not know is a usage error, and the view is removed again.
     * viewAttachArgv attaches it.
     */
    openView: async (
      targets: readonly WindowTarget[],
      layout: string,
      name: string,
      newView: () => string,
    ): Promise<WindowTarget> => {
      const view = { project: `${VIEW_PREFIX}${newView()}`, window: name };
      const [first, ...rest] = targets.map((t) => [
        '/bin/sh',
        '-c',
        `unset TMUX; exec ${attachArgv(t, newView()).map(shellWord).join(' ')}`,
      ]);
      if (!first) throw new MesaError('internal', 'a view needs a window to show');
      const splits = rest.flatMap((pane) => [
        ...[';', 'split-window', '-t', exact(view), ...pane],
        ...[';', 'select-layout', '-t', exact(view), 'tiled'],
      ]);
      await must(
        ['new-session', '-d', '-s', view.project, '-n', name, ...first, ...splits],
        'internal',
        'could not open the view',
      );
      const laid = await tmux(['select-layout', '-t', exact(view), layout]);
      if (!laid.ok) {
        await closeView(view);
        throw new MesaError('usage', `tmux cannot lay out a view as ${layout}: ${laid.detail}`);
      }
      return view;
    },
    closeView,
    /**
     * The argv that shows a view (openView) in this terminal; tmux removes the view, and the
     * terminals in its panes, when the terminal detaches. Set only once attached: a session that
     * no terminal has yet would go at once.
     */
    viewAttachArgv: (view: WindowTarget) => [
      'tmux',
      '-L',
      socket,
      '-f',
      '/dev/null',
      'attach-session',
      '-t',
      `=${view.project}`,
      ';',
      'set-option',
      'destroy-unattached',
      'on',
    ],
    /** The window itself, with its pane's state; undefined when it is gone. */
    findWindow: async (target: WindowTarget) =>
      (await listWindows(target.project)).find((w) => w.window === target.window),
    windowExists: async (target: WindowTarget) =>
      (await tmux(['list-panes', '-t', exact(target), '-F', '#{pane_id}'])).ok,
  };
}

export type TmuxBackend = ReturnType<typeof tmuxBackend>;

/** kill-window, where a window that vanished since it was seen is already the goal. */
export async function killIfThere(tmux: Pick<TmuxBackend, 'killWindow'>, target: WindowTarget) {
  try {
    await tmux.killWindow(target);
  } catch (error) {
    if (!(error instanceof MesaError && error.code === 'not_found')) throw error;
  }
}
