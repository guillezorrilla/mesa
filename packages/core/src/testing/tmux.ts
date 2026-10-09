import type { RunResult } from '../lib/process.js';
import { type TmuxBackend, tmuxBackend } from '../sessions/tmux/backend.js';
import { tmuxLine } from './tmux-line.js';

/** One window of `fakeTmux`: tests may mark it exited (`dead`) or read what was typed into it. */
export type FakeWindow = {
  project: string;
  window: string;
  path: string;
  /** The command tmux started the window with. */
  launch: string;
  /** Its pane's process, when a test needs one the listing will match. */
  pid?: number;
  /** What `pane_current_command` shows: claude's version, or a shell once the agent is gone. */
  running: string;
  dead: boolean;
  /** How it exited, once dead: an exit status, or a signal's name. */
  status?: number;
  signal?: string;
  typed: string[];
  /** Every key and text sent to it, in order (`Escape`, `/exit`, `Enter`); `typed` is the text alone, its screen. */
  keys: string[];
  /** The variables it was opened with (`-e`), such as MESA_SESSION_ID. */
  env: Record<string, string>;
  /** Its size once resized; `pinned` until its window-size option is unset, back to tmux's policy. */
  size?: { cols: number; rows: number; pinned: boolean };
  /** The shell command pipe-pane gave its output to, when it is logged. */
  pipe?: string;
};

/** A window for fakeTmux: its project and name, the rest as Mesa's claude window has them. */
export type NewWindow = Pick<FakeWindow, 'project' | 'window'> & Partial<FakeWindow>;
const newWindow = (w: NewWindow): FakeWindow => ({
  path: `/src/${w.project}`,
  launch: 'claude',
  running: '2.1.282',
  dead: false,
  typed: [],
  keys: [],
  env: {},
  ...w,
});

/** tmux's named layouts, the ones fakeTmux accepts. */
const TMUX_LAYOUTS = [
  'even-horizontal',
  'even-vertical',
  'main-horizontal',
  'main-vertical',
  'tiled',
];

/**
 * A tmux server in memory, as a scripted runner answer: `scriptedRunner({ tmux: world.answer })`.
 * It speaks the commands the tmux backend sends (chained with `;`), over `windows`. `onKeys`
 * sees each text typed with `send-keys -l`, so a test can make an agent react, say quit on /exit.
 * The world is a TmuxBackend too, the real one over this server on mesa-default, for a test of a
 * module that takes the backend itself. The server answers whatever socket a call names.
 */
export function fakeTmux(
  opts: {
    onKeys?: (window: FakeWindow, text: string) => void;
    /**
     * Sees each window once the command that opened it has run (its pipe-pane too), so a test can
     * make its agent act, say finish a run (finishesRun).
     */
    onOpen?: (window: FakeWindow) => void;
    /** tmux commands that fail, as a broken server would (`new-session`); `failing` on the world. */
    failing?: string | string[];
    /** tmux commands that time out, as a hung server's would; `slow` on the world. */
    slow?: string[];
    /**
     * Sees each command that succeeded, after onOpen and awaited before the call returns: a test
     * can act between tmux's answer and Mesa's use of it, say end a run while its waiter looks.
     * What it throws, the call throws.
     */
    after?: (command: string[]) => void | Promise<void>;
    /** Sees each command before it is answered: a test can change the server first. */
    before?: (command: string[]) => void;
  } = {},
) {
  const windows: FakeWindow[] = [];
  /** Global hooks by name, as set-hook -g sets them: one command each. */
  const hooks = new Map<string, string>();
  /** The shell commands run-shell -b was given, in order; the fake runs none of them. */
  const ranLater: string[] = [];
  /** A server runs once something started it; before that, tmux answers only with an error. */
  let server = false;
  /** The windows the call being answered opened, for onOpen once it is done. */
  const openedNow: FakeWindow[] = [];
  const noServer = () => failed('no server running on /private/tmp/tmux-501/fake');
  const failed = (detail: string): RunResult => ({ ok: false, reason: 'failed', detail });
  const flag = (args: string[], name: string) => args[args.indexOf(name) + 1] ?? '';
  /** The window `=project:=window` names: split at its last `:=`, as tmux's exact target reads. */
  const find = (target: string) => {
    const at = target.lastIndexOf(':=');
    if (!target.startsWith('=') || at < 1) return undefined;
    const [project, window] = [target.slice(1, at), target.slice(at + 2)];
    return windows.find((w) => w.project === project && w.window === window);
  };
  const line = (w: FakeWindow, i: number) =>
    tmuxLine({ ...w, index: i, command: w.dead ? '' : w.running });
  const one = (args: string[]): RunResult => {
    const [command = '', ...rest] = args;
    if (world.failing.includes(command)) return failed(`${command} failed`);
    if (world.slow.includes(command))
      return { ok: false, reason: 'timeout', detail: `${command} timed out` };
    const ok = (stdout = ''): RunResult => ({ ok: true, stdout });
    const target = flag(rest, '-t');
    switch (command) {
      case 'has-session':
        return windows.some((w) => `=${w.project}` === target)
          ? ok()
          : failed("can't find session");
      case 'new-session':
      case 'new-window': {
        server = true;
        const project = command === 'new-session' ? flag(rest, '-s') : target.slice(1, -1);
        const [path, window] = [flag(rest, '-c'), flag(rest, '-n')];
        const env = rest.flatMap((word, i) => (rest[i - 1] === '-e' ? [word.split(/=(.*)/s)] : []));
        const opened = newWindow({
          project,
          window,
          path,
          launch: rest.at(-1) ?? '',
          env: Object.fromEntries(env.map(([name = '', value = '']) => [name, value])),
        });
        windows.push(opened);
        world.opened.push(opened);
        openedNow.push(opened);
        return ok();
      }
      case 'kill-window': {
        const w = find(target);
        if (!w) return failed("can't find window");
        windows.splice(windows.indexOf(w), 1);
        return ok();
      }
      case 'kill-session': {
        const gone = windows.filter((w) => `=${w.project}` === target);
        for (const w of gone) windows.splice(windows.indexOf(w), 1);
        return gone.length ? ok() : failed("can't find session");
      }
      // A view's panes (openView): the split is on its one window, the layout one tmux has.
      case 'split-window':
        return find(target) ? ok() : failed("can't find window");
      case 'select-layout':
        return TMUX_LAYOUTS.includes(rest.at(-1) ?? '')
          ? ok()
          : failed(`invalid layout: ${rest.at(-1)}`);
      case 'list-windows': {
        // Mesa's server outlives its last window (exit-empty off) and then says this.
        if (!windows.length) return failed('no current target');
        const shown = rest.includes('-a')
          ? windows
          : windows.filter((w) => `=${w.project}` === target);
        if (!shown.length) return failed(`can't find session: ${target.slice(1)}`);
        return ok(shown.map(line).join('\n'));
      }
      case 'list-panes':
        return find(target) ? ok('%1') : failed("can't find window");
      case 'display-message': {
        const w = find(target);
        return w
          ? ok(`${w.dead ? 1 : 0}\t${w.dead ? '' : w.running}`)
          : failed("can't find window");
      }
      case 'send-keys': {
        const w = find(target);
        if (!w) return failed("can't find window");
        w.keys.push(rest.at(-1) ?? '');
        if (rest.includes('-l')) {
          const text = rest.at(-1) ?? '';
          w.typed.push(text);
          opts.onKeys?.(w, text);
        }
        return ok();
      }
      case 'pipe-pane': {
        const w = find(target);
        if (!w) return failed("can't find window");
        w.pipe = rest.at(-1);
        return ok();
      }
      case 'capture-pane': {
        const w = find(target);
        return w ? ok(w.typed.join('\n')) : failed("can't find window");
      }
      case 'start-server':
        server = true;
        return ok();
      case 'kill-server':
        if (!server) return noServer();
        server = false;
        windows.splice(0);
        return ok();
      case 'resize-window': {
        const w = find(target);
        if (!w) return failed("can't find window");
        w.size = { cols: Number(flag(rest, '-x')), rows: Number(flag(rest, '-y')), pinned: true };
        return ok();
      }
      case 'set-option': {
        const w = rest.includes('-w') ? find(target) : undefined;
        if (w?.size && rest.includes('-u') && rest.at(-1) === 'window-size') w.size.pinned = false;
        return ok();
      }
      case 'bind-key':
      case 'set-environment':
        return ok();
      // Only the forms Mesa sends: `set-hook -g <name> <command>`, `show-hooks -g <name>`.
      case 'set-hook':
        if (!server) return noServer();
        if (rest.length !== 3 || rest[0] !== '-g')
          return failed(`fakeTmux: set-hook ${rest.join(' ')}`);
        hooks.set(rest[1] ?? '', rest[2] ?? '');
        return ok();
      case 'run-shell':
        if (!server) return noServer();
        if (rest.length !== 2 || rest[0] !== '-b')
          return failed(`fakeTmux: run-shell ${rest.join(' ')}`);
        ranLater.push(rest[1] ?? '');
        return ok();
      case 'show-hooks': {
        if (!server) return noServer();
        if (rest.length !== 2 || rest[0] !== '-g')
          return failed(`fakeTmux: show-hooks ${rest.join(' ')}`);
        const name = rest[1] ?? '';
        const set = hooks.get(name);
        return ok(set === undefined ? name : `${name}[0] ${set}`);
      }
      default:
        // A command this fake does not know fails, so a test cannot pass on a silent no-op.
        return failed(`fakeTmux does not know ${command}`);
    }
  };
  /**
   * Every call: `-u -L <socket> -f /dev/null` first, then commands. As tmux reads its arguments,
   * a word ending in `;` ends a command (the `;` dropped), and a closing `\;` is a literal `;`.
   */
  const answer = async (args: string[]): Promise<RunResult> => {
    const commands: string[][] = [[]];
    for (const word of args.slice(5)) {
      if (word.endsWith('\\;')) commands.at(-1)?.push(`${word.slice(0, -2)};`);
      else if (word.endsWith(';')) {
        if (word.length > 1) commands.at(-1)?.push(word.slice(0, -1));
        commands.push([]);
      } else commands.at(-1)?.push(word);
    }
    let result: RunResult = { ok: true, stdout: '' };
    const answered: string[][] = [];
    // tmux skips an empty command (a leading, trailing, or doubled `;`).
    for (const command of commands.filter((c) => c.length)) {
      opts.before?.(command);
      result = one(command);
      if (!result.ok) break;
      answered.push(command);
    }
    for (const w of openedNow.splice(0)) opts.onOpen?.(w);
    for (const command of answered) await opts.after?.(command);
    return result;
  };
  const world = {
    ...tmuxBackend({
      run: (_file, args) => answer(args),
      socket: 'mesa-default',
      env: {},
      sleep: async () => {},
    }),
    windows,
    /** A window already on the server, as Mesa would have opened it: claude running in it. */
    addWindow: (w: NewWindow) => {
      server = true;
      windows.push(newWindow(w));
    },
    answer,
    hooks,
    ranLater,
    /** Every window the server opened, in order, closed ones too. */
    opened: [] as FakeWindow[],
    /** The commands that fail from now on; a test may change it. */
    failing: [opts.failing ?? []].flat(),
    /** The commands that time out from now on, as a hung server's would. */
    slow: opts.slow ?? [],
  };
  return world satisfies TmuxBackend;
}
