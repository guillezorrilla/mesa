import { appendFileSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeLiveSessions, claudeTranscripts } from '../agents/claude/paths.js';
import { codexSessionIndex, codexSessions } from '../agents/codex/paths.js';
import type { LaunchDefaults } from '../agents/launch-flags.js';
import type { ListingDeps } from '../agents/listing.js';
import type { Env, Runner } from '../lib/process.js';
import { localDay } from '../lib/time.js';
import { fixedClock } from './clock.js';
import { scriptedRunner } from './runner.js';
import { tempDir } from './tmp.js';
import { type FakeWindow, fakeTmux } from './tmux.js';

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

/** What `claude --version` answers in tests. */
export const CLAUDE_VERSION = '2.1.282 (Claude Code)';

// The mesa-vault mount a launch under testDeps carries (agents/mesa-mount.ts), as its shell
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
  const log: string[] = [];
  const world = agentWorld({
    ...opts,
    before: (command) => {
      if (command[0] === 'send-keys') log.push(`keys ${command.at(-1)}`);
      opts.before?.(command);
    },
  });
  const sleep = async (ms: number) => {
    log.push(`sleep ${ms}`);
  };
  return { ...world, sleep, log };
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
