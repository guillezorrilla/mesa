import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Clock } from './clock.js';
import type { Decision, DecisionRecorder } from './decisions/types.js';
import type { IdSource } from './ids.js';
import type { MesaDeps } from './mesa.js';
import type { Runner, RunResult } from './process.js';
import { MesaError } from './result.js';
import type { NewSession } from './sessions/store.js';

// Test implementations of Mesa's seams, real but controlled: a scripted runner and a temp home,
// never mocks of Mesa's own modules. Published as @mesa/core/testing, not from the index.

export const fixedClock =
  (iso = '2026-09-24T12:00:00.000Z'): Clock =>
  () =>
    new Date(iso);

/** ULID-shaped ids 01TEST...0001, 01TEST...0002, and so on: known ahead, so golden files hold. */
export function sequentialIds(): IdSource {
  let n = 0;
  return () => `01TEST${String(++n).padStart(20, '0')}`;
}

/** UUID-shaped ids 00000000-0000-4000-8000-000000000001 and up, for claude --session-id. */
export function sequentialUuids(): () => string {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

/** A clock that moves `stepMs` forward on every read: for timeouts and before/after stamps. */
export function steppingClock(iso = '2026-09-24T12:00:00.000Z', stepMs = 1000): Clock {
  let now = new Date(iso).getTime();
  return () => {
    const date = new Date(now);
    now += stepMs;
    return date;
  };
}

/** Stdout, or a function of the call's arguments returning stdout or a whole result. */
type Answer = string | ((args: string[]) => string | RunResult);

/**
 * Answers from `outputs` by binary name; names in `missing` are ENOENT, names in `slow` time out,
 * names in `failing` exit non-zero. Every call is recorded.
 */
export function scriptedRunner(
  outputs: Record<string, Answer> = {},
  opts: { missing?: string[]; slow?: string[]; failing?: string[] } = {},
) {
  const calls: { file: string; args: string[]; timeoutMs: number }[] = [];
  const run: Runner = async (file, args, timeoutMs) => {
    calls.push({ file, args, timeoutMs });
    if (opts.missing?.includes(file)) return { ok: false, reason: 'missing', detail: 'ENOENT' };
    if (opts.slow?.includes(file)) return { ok: false, reason: 'timeout', detail: 'killed' };
    if (opts.failing?.includes(file)) return { ok: false, reason: 'failed', detail: 'exit 1' };
    const answer = outputs[file] ?? '';
    const said = typeof answer === 'function' ? answer(args) : answer;
    return typeof said === 'string' ? { ok: true, stdout: said } : said;
  };
  return { run, calls };
}

/**
 * SP-1's recorded `claude agents --json` rows (docs/spikes/state-signals.md, from a throwaway
 * spike project): one conversation idle, waiting on a permission prompt, waiting on a question,
 * then resumed under a new pid with the same session id.
 */
export const SPIKE_LISTING = (() => {
  const row = {
    pid: 67213,
    cwd: '/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj',
    kind: 'interactive',
    startedAt: 1790276764032,
    sessionId: '36c173f2-803e-4845-bd97-a032b37c6d6d',
    name: 'mesa-spike-proj-55',
    status: 'idle',
  };
  return {
    idle: row,
    permission: { ...row, status: 'waiting', waitingFor: 'permission prompt' },
    question: { ...row, status: 'waiting', waitingFor: 'input needed' },
    resumed: { ...row, pid: 75186, startedAt: 1790276958673, name: 'mesa-spike-proj-36' },
  };
})();

/** A DecisionRecorder that keeps every decision in `decisions`, for tests. */
export function memoryRecorder(): DecisionRecorder & { decisions: Decision[] } {
  const decisions: Decision[] = [];
  return { decisions, record: (d) => void decisions.push(d) };
}

/** One window of `fakeTmux`: tests may mark it exited (`dead`) or read what was typed into it. */
export type FakeWindow = {
  project: string;
  window: string;
  path: string;
  /** The command tmux started the window with. */
  launch: string;
  /** What `pane_current_command` shows: claude's version, or a shell once the agent is gone. */
  running: string;
  dead: boolean;
  typed: string[];
};

/**
 * A tmux server in memory, as a scripted runner answer: `scriptedRunner({ tmux: world.answer })`.
 * It speaks the commands the tmux backend sends (chained with `;`), over `windows`. `onKeys`
 * sees each text typed with `send-keys -l`, so a test can make an agent react, say quit on /exit.
 */
export function fakeTmux(opts: { onKeys?: (window: FakeWindow, text: string) => void } = {}) {
  const windows: FakeWindow[] = [];
  const failed = (detail: string): RunResult => ({ ok: false, reason: 'failed', detail });
  const flag = (args: string[], name: string) => args[args.indexOf(name) + 1] ?? '';
  const find = (target: string) => {
    const [, project, window] = /^=(.*):=(.*)$/.exec(target) ?? [];
    return windows.find((w) => w.project === project && w.window === window);
  };
  const line = (w: FakeWindow, i: number) =>
    [
      w.project,
      i,
      w.window,
      4242,
      w.dead ? '' : w.running,
      w.path,
      1790359178,
      w.dead ? 1 : 0,
    ].join('\t');
  const one = (args: string[]): RunResult => {
    const [command = '', ...rest] = args;
    const ok = (stdout = ''): RunResult => ({ ok: true, stdout });
    const target = flag(rest, '-t');
    switch (command) {
      case 'has-session':
        return windows.some((w) => `=${w.project}` === target)
          ? ok()
          : failed("can't find session");
      case 'new-session':
      case 'new-window': {
        const project = command === 'new-session' ? flag(rest, '-s') : target.slice(1, -1);
        const [path, window] = [flag(rest, '-c'), flag(rest, '-n')];
        windows.push({
          project,
          window,
          path,
          launch: rest.at(-1) ?? '',
          running: '2.1.282',
          dead: false,
          typed: [],
        });
        return ok();
      }
      case 'kill-window': {
        const w = find(target);
        if (!w) return failed("can't find window");
        windows.splice(windows.indexOf(w), 1);
        return ok();
      }
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
        if (rest.includes('-l')) {
          // tmux turns a closing `\;` into `;`, as it does for any word.
          const word = rest.at(-1) ?? '';
          const text = word.endsWith('\\;') ? `${word.slice(0, -2)};` : word;
          w.typed.push(text);
          opts.onKeys?.(w, text);
        }
        return ok();
      }
      case 'capture-pane': {
        const w = find(target);
        return w ? ok(w.typed.join('\n')) : failed("can't find window");
      }
      case 'start-server':
      case 'set-option':
      case 'bind-key':
      case 'set-environment':
        return ok();
      default:
        // A command this fake does not know fails, so a test cannot pass on a silent no-op.
        return failed(`fakeTmux does not know ${command}`);
    }
  };
  /** Every call: `-L <socket> -f /dev/null` first, then commands separated by `;`. */
  const answer = (args: string[]): RunResult => {
    const commands: string[][] = [[]];
    for (const word of args.slice(4)) {
      if (word === ';') commands.push([]);
      else commands.at(-1)?.push(word);
    }
    let result: RunResult = { ok: true, stdout: '' };
    for (const command of commands) {
      result = one(command);
      if (!result.ok) return result;
    }
    return result;
  };
  return { windows, answer };
}

/** Deps over `home` (a temp dir): cwd is home, the clock is fixed, and Obsidian lives under home. */
export const testDeps = (home: string, overrides: Partial<MesaDeps> = {}): MesaDeps => ({
  home,
  cwd: home,
  clock: fixedClock(),
  newId: sequentialIds(),
  newUuid: sequentialUuids(),
  sleep: async () => {},
  self: ['/usr/local/bin/mesa'],
  env: {},
  run: scriptedRunner().run,
  argv: ['test'],
  obsidian: {
    registered: join(home, 'bin/obsidian'),
    bundle: join(home, 'Obsidian.app/obsidian-cli'),
    plist: join(home, 'Obsidian.app/Info.plist'),
    vaultList: join(home, 'obsidian/obsidian.json'),
  },
  ...overrides,
});

/** A session record before its id: claude working on lantern-cove unless `overrides` say otherwise. */
export function newSession(overrides: Partial<NewSession> = {}): NewSession {
  const project = overrides.project ?? 'lantern-cove';
  const startedAt = overrides.startedAt ?? '2026-09-24T12:00:00.000Z';
  return {
    kind: 'interactive',
    project,
    agent: 'claude',
    tmux: { socket: 'mesa-default', session: project, window: 'claude-aaaaaa' },
    startedAt,
    lastState: { state: 'working', confidence: 0.95, at: startedAt, source: 'mesa' },
    ...overrides,
  };
}

/** A fresh temp dir, symlinks resolved (macOS `/var` is `/private/var`). */
export const tempDir = (prefix = 'mesa-') => realpathSync(mkdtempSync(join(tmpdir(), prefix)));

/** The MesaError a call throws, as `{ code, message }`; throws if it returns or throws anything else. */
export function thrown(fn: () => unknown): { code: string; message: string } {
  try {
    fn();
  } catch (error) {
    if (error instanceof MesaError) return { code: error.code, message: error.message };
    throw error;
  }
  throw new Error('expected a MesaError');
}
