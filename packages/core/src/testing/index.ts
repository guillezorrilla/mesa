import { execFileSync } from 'node:child_process';
import fs, { appendFileSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeLiveSessions, claudeTranscripts } from '../agents/claude/paths.js';
import { codexSessionIndex, codexSessions } from '../agents/codex/paths.js';
import type { LaunchDefaults } from '../agents/launch-flags.js';
import type { Decision, DecisionRecorder } from '../decisions/types.js';
import type { Clock } from '../lib/clock.js';
import type { IdSource } from '../lib/ids.js';
import type { LockDeps } from '../lib/lock-file.js';
import type { Env, Runner, RunResult } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import { localDay } from '../lib/time.js';
import { createMesa, type MesaDeps } from '../mesa.js';
import { profilePaths } from '../profile/paths.js';
import type { ListingDeps } from '../sessions/agent-listing.js';
import { prepareOutputLog } from '../sessions/output-log.js';
import type { NewSession } from '../sessions/record.js';
import { sessionStore } from '../sessions/store.js';
import { testEnv, testRunner } from './env.js';
import { fakeHttp, memorySecretStore } from './sources.js';
import { tempDir } from './tmp.js';

// Test implementations of Mesa's seams, real but controlled: a scripted runner and a temp home,
// never mocks of Mesa's own modules. Published as @mesa/core/testing, not from the index.

export const fixedClock =
  (iso = '2026-09-24T12:00:00.000Z'): Clock =>
  () =>
    new Date(iso);

/** Lock deps for this test process, which every holder but the ones `alive` rejects shares. */
export const lockDeps = (alive: (pid: number) => boolean = () => true): LockDeps => ({
  processId: 4242,
  processAlive: alive,
  clock: fixedClock(),
});

/** ULID-shaped ids 01TEST...0001, 01TEST...0002, and so on: known ahead, so golden files hold. */
export function sequentialIds(): IdSource {
  let n = 0;
  return () => `01TEST${String(++n).padStart(20, '0')}`;
}

/** Ids whose Mesa session ids (their last 8 characters) are `short`, in order: planted records keep the ids a test names. */
export function shortIds(...short: string[]): IdSource {
  let n = 0;
  return () => {
    const id = short[n++];
    if (!id) throw new Error(`shortIds: only ${short.length} ids`);
    return `01TEST${'0'.repeat(12)}${id.toUpperCase()}`;
  };
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
  /** How it exited, once dead: an exit status, or a signal's name. */
  status?: number;
  signal?: string;
  typed: string[];
  /** The shell command pipe-pane gave its output to, when it is logged. */
  pipe?: string;
};

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
 */
export function fakeTmux(
  opts: {
    onKeys?: (window: FakeWindow, text: string) => void;
    /**
     * Sees each window once the command that opened it has run (its pipe-pane too), so a test can
     * make its agent act, say finish a run (finishesRun).
     */
    onOpen?: (window: FakeWindow) => void;
    /** A tmux command that fails, as a broken server would (`new-session`). */
    failing?: string;
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
  const find = (target: string) => {
    const [, project, window] = /^=(.*):=(.*)$/.exec(target) ?? [];
    return windows.find((w) => w.project === project && w.window === window);
  };
  const line = (w: FakeWindow, i: number) =>
    tmuxLine({ ...w, index: i, command: w.dead ? '' : w.running });
  const one = (args: string[]): RunResult => {
    const [command = '', ...rest] = args;
    if (command === opts.failing) return failed(`${command} failed`);
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
        const opened: FakeWindow = {
          project,
          window,
          path,
          launch: rest.at(-1) ?? '',
          running: '2.1.282',
          dead: false,
          typed: [],
        };
        windows.push(opened);
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
      case 'set-option':
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
  const answer = (args: string[]): RunResult => {
    const commands: string[][] = [[]];
    for (const word of args.slice(5)) {
      if (word.endsWith('\\;')) commands.at(-1)?.push(`${word.slice(0, -2)};`);
      else if (word.endsWith(';')) {
        if (word.length > 1) commands.at(-1)?.push(word.slice(0, -1));
        commands.push([]);
      } else commands.at(-1)?.push(word);
    }
    let result: RunResult = { ok: true, stdout: '' };
    // tmux skips an empty command (a leading, trailing, or doubled `;`).
    for (const command of commands.filter((c) => c.length)) {
      result = one(command);
      if (!result.ok) break;
    }
    for (const w of openedNow.splice(0)) opts.onOpen?.(w);
    return result;
  };
  return { windows, answer, hooks, ranLater };
}

/**
 * A headless run's agent in fakeTmux (`onOpen`): writes `output` where the run's command sends its
 * stdout (none when undefined), prints `stderr` on its pane, and so into its output log when it
 * has one, then exits with `status`, or is killed by `signal`. A window that is not a run's is
 * left running.
 */
export const finishesRun =
  ({
    output,
    status = 0,
    signal,
    stderr,
  }: {
    output?: string;
    status?: number;
    signal?: string;
    stderr?: string;
  }) =>
  (w: FakeWindow) => {
    const file = /^exec (?:claude -p|codex exec|agy --log-file .* --print) .* >'([^']+)'$/.exec(
      w.launch,
    )?.[1];
    if (!file) return;
    if (output !== undefined) writeFileSync(file, output);
    if (stderr !== undefined) {
      w.typed.push(stderr);
      // pipe-pane's `cat >> '<log>'`, with tmux's `##` for a `#`.
      const log = /^cat >> '(.+)'$/.exec(w.pipe ?? '')?.[1]?.replaceAll('##', '#');
      if (log) appendFileSync(log, stderr);
    }
    w.dead = true;
    if (signal) w.signal = signal;
    else w.status = status;
  };

/** Recorded Codex exec streams, with invented ids. */
export const codexResult = (name: 'success' | 'skill-stdin') =>
  readFileSync(
    join(import.meta.dirname, '../agents/codex/fixtures/results', `${name}.jsonl`),
    'utf8',
  );

/**
 * `claude -p --output-format json` results, as a run's output file holds them
 * (agents/claude/fixtures/results/), recorded from Claude Code 2.1.283, trimmed, their ids
 * invented: `success`, a real session-summary run on an invented repo, and `not-logged-in`, from
 * a HOME with no login.
 */
export const claudeResult = (name: 'success' | 'not-logged-in') =>
  readFileSync(
    fileURLToPath(new URL(`../agents/claude/fixtures/results/${name}.json`, import.meta.url)),
    'utf8',
  );

/** mulberry32: numbers in [0, 1) from `seed`, the same on every run, so a failing case replays. */
export function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What `claude --version` answers in tests. */
export const CLAUDE_VERSION = '2.1.282 (Claude Code)';

// The mesa-vault mount a launch under testDeps carries (agents/vault-mount.ts), as its shell
// words: `/usr/local/bin/mesa vault mcp`, spelled out here so a test checks the real argv.
const CLAUDE_MCP_CONFIG = `'--mcp-config={"mcpServers":{"mesa-vault":{"type":"stdio","command":"/usr/local/bin/mesa","args":["vault","mcp"]}}}'`;
/** Claude Code's, on an interactive start, resume, or fork. */
export const CLAUDE_MOUNT = `${CLAUDE_MCP_CONFIG} '--allowedTools=mcp__mesa-vault'`;
/** Claude Code's on a headless run, the profile's allowed tools after it. */
export const CLAUDE_HEADLESS_MOUNT = `${CLAUDE_MCP_CONFIG} --allowedTools 'mcp__mesa-vault'`;
/** Codex's four -c overrides. */
export const CODEX_MOUNT = `-c 'mcp_servers.mesa-vault.command="/usr/local/bin/mesa"' -c 'mcp_servers.mesa-vault.args=["vault","mcp"]' -c 'mcp_servers.mesa-vault.env_vars=["MESA_SESSION_ID","MESA_PROFILE"]' -c 'mcp_servers.mesa-vault.default_tools_approval_mode="approve"'`;
/** No launch defaults: every agent on its native config, as a new profile has it. */
export const NATIVE_LAUNCH: LaunchDefaults = { claude: {}, codex: {}, antigravity: {} };
/** What `codex --version` answers in tests (docs/spikes/codex.md). */
export const CODEX_VERSION = 'codex-cli 0.154.0';

/** A Codex thread's rollout as Codex writes it (agents/codex/fixtures/rollouts/tui.jsonl). */
const ROLLOUT = readFileSync(
  fileURLToPath(new URL('../agents/codex/fixtures/rollouts/tui.jsonl', import.meta.url)),
  'utf8',
);

/**
 * Codex's home in a temp folder: `env` puts it in the deps as `CODEX_HOME`, and `rollout` plants
 * a thread's rollout there, in its start's local-date folder, named as Codex names it, with the
 * fixture's lines under a first line naming `id`, `cwd`, and `startedAt`. `originator` is
 * `codex-tui` (an interactive codex) unless `codex_exec`; the file was last written at
 * `writtenAt`, else at `startedAt`. `name` names a thread in the session index.
 */
export function codexWorld() {
  const home = tempDir('codex-');
  const rollout = (t: {
    id: string;
    cwd: string;
    startedAt: string;
    originator?: string;
    writtenAt?: string;
  }) => {
    const start = new Date(t.startedAt);
    const time = start.toTimeString().slice(0, 8).replaceAll(':', '-');
    const dir = join(codexSessions(home), ...localDay(start).split('-'));
    const file = join(dir, `rollout-${localDay(start)}T${time}-${t.id}.jsonl`);
    const [meta = '', ...rest] = ROLLOUT.trimEnd().split('\n');
    const first = JSON.parse(meta);
    first.payload = {
      ...first.payload,
      session_id: t.id,
      id: t.id,
      cwd: t.cwd,
      timestamp: t.startedAt,
      originator: t.originator ?? 'codex-tui',
    };
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, [JSON.stringify(first), ...rest].join('\n'));
    const written = new Date(t.writtenAt ?? t.startedAt);
    utimesSync(file, written, written);
    return file;
  };
  /** Names thread `id` as a rename in Codex does: a line appended to its session index. */
  const name = (id: string, threadName: string) =>
    appendFileSync(
      codexSessionIndex(home),
      `${JSON.stringify({ id, thread_name: threadName, updated_at: '2026-09-20T12:00:00.000Z' })}\n`,
    );
  return { home, env: { CODEX_HOME: home }, rollout, name };
}

/**
 * Coding agents and a tmux server in memory, as one scripted runner, and Codex's home
 * (codexWorld): an agent set to false is uninstalled, and the rest shapes fakeTmux.
 */
export function agentWorld({
  claude = true,
  codex = true,
  antigravity = true,
  ...tmuxOpts
}: Parameters<typeof fakeTmux>[0] & {
  claude?: boolean;
  codex?: boolean;
  antigravity?: boolean;
} = {}) {
  const tmux = fakeTmux(tmuxOpts);
  const missing = [
    ...(claude ? [] : ['claude']),
    ...(codex ? [] : ['codex']),
    ...(antigravity ? [] : ['agy']),
  ];
  const scripted = scriptedRunner(
    { claude: CLAUDE_VERSION, codex: CODEX_VERSION, agy: '1.2.12', tmux: tmux.answer },
    { missing },
  );
  return { ...scripted, tmux, codex: codexWorld() };
}

/** A fake agent world's key submissions and sleeps in order, for send and stop timing checks. */
export function timedAgentWorld(opts: Parameters<typeof agentWorld>[0] = {}) {
  const world = agentWorld(opts);
  const log: string[] = [];
  const run: Runner = (file, args, ms) => {
    if (file === 'tmux' && args[5] === 'send-keys') log.push(`keys ${args.at(-1)}`);
    return world.run(file, args, ms);
  };
  const sleep = async (ms: number) => {
    log.push(`sleep ${ms}`);
  };
  return { ...world, run, sleep, log };
}

/**
 * What the agent listings read (listAgentProcesses): claude's from `run`, Codex's from an empty
 * home of its own, at the fixed clock's time, unless `over` says otherwise.
 */
export const listingDeps = (run: Runner, over: Partial<ListingDeps> = {}): ListingDeps => ({
  run,
  env: { CODEX_HOME: tempDir('codex-') },
  home: tempDir(),
  clock: fixedClock(),
  ...over,
});

/**
 * One `list-windows` line in Mesa's format (sessions/tmux/format.ts), as tmux prints it: a live
 * claude on pid 4242 in `/src/<project>` unless told otherwise.
 */
export function tmuxLine(w: {
  project: string;
  window: string;
  index?: number;
  pid?: number;
  command?: string;
  path?: string;
  dead?: boolean;
  status?: number;
  signal?: string;
}): string {
  return [
    w.project,
    w.index ?? 0,
    w.window,
    w.pid ?? 4242,
    w.command ?? '2.1.282',
    w.path ?? `/src/${w.project}`,
    1790359178,
    w.dead ? 1 : 0,
    w.status ?? '',
    w.signal ?? '',
  ].join('\t');
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
  // No network and an empty Keychain: a test that signs in passes atlassianWorld().deps.
  http: fakeHttp().http,
  listen: async () => {
    throw new Error('testDeps: no sign-in listener; pass fakeSignIn().listen');
  },
  secretStore: memorySecretStore().store,
  processAlive: () => true,
  processId: 4242,
  browserSelection: async () => undefined,
  argv: ['test'],
  // The repo's own library: tests that need another pass their own.
  skillsDir: fileURLToPath(new URL('../../../../skills', import.meta.url)),
  version: '0.1.0-beta.4',
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

/**
 * A session record across two projects (mesa open --with): lantern-cove, with tide-pool as its
 * additional project, each in its worktree on `feature` under /w, unless `overrides` say otherwise.
 */
export function multiProjectSession(overrides: Partial<NewSession> = {}): NewSession {
  const at = (project: string) => ({ path: `/w/${project}/feature`, branch: 'feature' });
  return newSession({
    worktree: at('lantern-cove'),
    additional: [{ project: 'tide-pool', worktree: at('tide-pool') }],
    ...overrides,
  });
}

export { fakeRelease } from './about.js';
export { gitConfigOff, testEnv, testRunner } from './env.js';
export { isolateTmp, tempDir } from './tmp.js';

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

/** Where a profile keeps its files: tests read and plant through it, never a spelled-out path. */
export { profilePaths };

/** A profile's session store under a temp home, as mesa keeps it: for reading or planting records. */
export const testStore = (home: string, profile = 'default', newId = sequentialIds()) =>
  sessionStore({ dir: profilePaths(home, profile).sessions, newId, lock: lockDeps() });

/**
 * A profile over `home` (a fresh temp dir by default) with its vault laid out and lantern-cove
 * registered: its mesa.yaml written from `mesaYaml` when given, else a minimal one.
 */
export function projectProfile(
  run: Runner,
  { mesaYaml, home = tempDir(), ...overrides }: Partial<MesaDeps> & { mesaYaml?: string } = {},
) {
  const dir = join(home, 'src/lantern-cove');
  mkdirSync(dir, { recursive: true });
  if (mesaYaml !== undefined) writeFileSync(join(dir, 'mesa.yaml'), mesaYaml);
  const mesa = createMesa('default', testDeps(home, { run, ...overrides }));
  mesa.init({ vault: 'vault' });
  mesa.vault.init();
  mesa.projects.register(dir, mesaYaml === undefined);
  return { home, dir, mesa };
}

/** `run` with the real git in it, for the temp repositories; the rest stays as `run` answers. */
export const withRealGit =
  (run: Runner): Runner =>
  (file, args, ms, options) =>
    file === 'git' ? testRunner(file, args, ms, options) : run(file, args, ms, options);

/** git in `dir`, as a person would type it, its output trimmed. */
export const testGit = (dir: string, ...args: string[]) =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: testEnv,
  }).trim();

/** `dir` as a git repository on main, its files in one commit. */
export function gitRepo(dir: string) {
  testGit(dir, 'init', '-q', '-b', 'main');
  testGit(dir, 'add', '-A');
  testGit(dir, 'commit', '-q', '-m', 'init');
}

/**
 * Another registered project beside projectProfile's lantern-cove, `name` under `home`/src, a git
 * repository on main with its mesa.yaml (`mesaYaml`, else a minimal one): an additional project's
 * (mesa open --with). Its folder.
 */
export function gitProject(
  mesa: ReturnType<typeof createMesa>,
  home: string,
  name: string,
  mesaYaml = `name: ${name}\n`,
) {
  const dir = join(home, 'src', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mesa.yaml'), mesaYaml);
  gitRepo(dir);
  mesa.projects.register(dir);
  return dir;
}

/**
 * lantern-cove and tide-pool, both git repositories on main through the real git, over agentWorld:
 * for a session across two projects (mesa open --with). `run` wraps that runner when given.
 */
export function twoProjects({
  run,
  newId,
}: {
  run?: (git: Runner) => Runner;
  newId?: IdSource;
} = {}) {
  const world = agentWorld();
  const git = withRealGit(world.run);
  const { home, dir, mesa } = projectProfile(run ? run(git) : git, newId ? { newId } : {});
  gitRepo(dir);
  const tide = gitProject(mesa, home, 'tide-pool');
  return { world, home, dir, tide, mesa };
}

/** Where Mesa puts `project`'s worktree for a branch folder, in the default profile. */
export const worktreeAt = (home: string, project: string, folder: string) =>
  join(profilePaths(home, 'default').worktrees, project, folder);

/** A repository's worktree count and branches, to compare before and after. */
export const repoState = (dir: string) => ({
  worktrees: testGit(dir, 'worktree', 'list', '--porcelain').match(/^worktree /gm)?.length,
  branches: testGit(dir, 'branch', '--list', '--format=%(refname:short)'),
});

/** A session's lock as a mesa killed while holding it leaves it; its path, for the test to remove. */
export function staleLock(home: string, id: string, holder = 'a killed mesa', profile = 'default') {
  const lock = join(profilePaths(home, profile).sessions, `${id}.json.lock`);
  writeFileSync(lock, holder);
  return lock;
}

/** Session `id`'s output log in the default profile, holding `text` as its pipe writes it; its path. */
export function plantOutputLog(home: string, id: string, text: string | Buffer) {
  const file = prepareOutputLog(profilePaths(home, 'default').logs, id);
  writeFileSync(file, text);
  return file;
}

/**
 * A live Claude Code process `pid`'s state file, with `fields` such as `name` and `nameSource`;
 * under `env`'s CLAUDE_CONFIG_DIR when it sets one.
 */
export function plantLiveSession(home: string, pid: number, fields: object, env: Env = {}) {
  const dir = claudeLiveSessions(home, env);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${pid}.json`), JSON.stringify({ pid, ...fields }));
}

/**
 * A Claude Code transcript on disk, as it writes one: conversation `id`, run in `cwd`, which it
 * names on a line after the first; `content` in place of those lines when given; under `env`'s
 * CLAUDE_CONFIG_DIR when it sets one. Its path.
 */
export function plantTranscript(
  home: string,
  id: string,
  cwd: string,
  content?: string,
  env: Env = {},
) {
  const folder = join(claudeTranscripts(home, env), cwd.replaceAll(/[^A-Za-z0-9]/g, '-'));
  mkdirSync(folder, { recursive: true });
  const lines = [
    { type: 'last-prompt', sessionId: id },
    { type: 'user', sessionId: id, cwd, message: { role: 'user', content: 'Remember lantern' } },
  ];
  const file = join(folder, `${id}.jsonl`);
  writeFileSync(file, content ?? lines.map((l) => JSON.stringify(l)).join('\n'));
  return file;
}

/**
 * Counts what `node:fs` opens and reads from now on, through its `openSync` and `readSync`: each
 * path opened, in order, and the bytes read. `restore` puts both back.
 */
export function countReads() {
  const { openSync, readSync } = fs;
  const opened: string[] = [];
  let bytes = 0;
  fs.openSync = ((...args: Parameters<typeof openSync>) => {
    opened.push(String(args[0]));
    return openSync(...args);
  }) as typeof fs.openSync;
  fs.readSync = ((...args: Parameters<typeof readSync>) => {
    const n = readSync(...args);
    bytes += n;
    return n;
  }) as typeof fs.readSync;
  syncBuiltinESMExports();
  return {
    opened,
    bytes: () => bytes,
    restore: () => {
      Object.assign(fs, { openSync, readSync });
      syncBuiltinESMExports();
    },
  };
}

/**
 * A Claude Code transcript last written at `at`: one user line naming `cwd`, then `extra` (title
 * entries, `{ type: 'custom-title', customTitle }`).
 */
export function datedTranscript(
  home: string,
  id: string,
  cwd: string,
  at: string,
  ...extra: object[]
) {
  const lines = [{ type: 'user', cwd, message: { role: 'user', content: 'Chart the tide' } }];
  const file = plantTranscript(
    home,
    id,
    cwd,
    [...lines, ...extra].map((l) => JSON.stringify(l)).join('\n'),
  );
  utimesSync(file, new Date(at), new Date(at));
  return file;
}

export { type FakePullRequest, fakeGh } from './gh.js';
export {
  atlassianWorld,
  type FakeRequest,
  fakeHttp,
  fakeSignIn,
  importProfile,
  importWorld,
  memorySecretStore,
  notionDataSourceObject,
  notionPageObject,
  notionWorld,
  TEST_BROKER,
  TEST_CONFLUENCE,
  TEST_JIRA,
  TEST_NOTION,
  writesImportNotes,
} from './sources.js';
