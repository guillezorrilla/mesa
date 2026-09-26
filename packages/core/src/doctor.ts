import { existsSync } from 'node:fs';
import { AGENT_NAMES, agentBinary } from './agents/agents.js';
import type { ClaudeHooksStatus, TmuxHookStatus } from './agents/claude/hooks.js';
import type { BackendName } from './decisions/types.js';
import { type Binary, CHECK_TIMEOUT_MS, firstVersion, probe } from './lib/probe.js';
import type { Runner } from './lib/process.js';
import { toFail } from './lib/result.js';
import { TMUX_INSTALL } from './sessions/tmux/backend.js';
import type { ObsidianPaths } from './vault/obsidian.js';

export type Check = {
  name: string;
  ok: boolean;
  /** How to show the row: `fail` blocks Mesa, `warn` does not. */
  status: 'ok' | 'warn' | 'fail';
  version?: string;
  hint: string;
  path?: string;
  registered?: boolean;
};

/** Decided here once: `healthy` when tmux and at least one agent answered; `summary` says why not. */
export type DoctorReport = { healthy: boolean; summary: string; checks: Check[] };

type Probe = Omit<Check, 'status'>;

// tmux is required on its own; the agents are required as a group: at least one of them.
const BINARIES: Binary[] = [
  { name: 'tmux', args: ['-V'], role: 'required', install: TMUX_INSTALL },
  ...AGENT_NAMES.map((name) => agentBinary(name)),
];

const REQUIREMENT = `tmux and at least one agent (${AGENT_NAMES.join(' or ')}) are required`;

async function obsidianCheck(run: Runner, paths: ObsidianPaths): Promise<Probe> {
  const base = { name: 'obsidian' };
  const path = [paths.registered, paths.bundle].find((p) => existsSync(p));
  if (!path) {
    return {
      ...base,
      ok: false,
      registered: false,
      hint: `Obsidian 1.12.7+ not found at ${paths.bundle}`,
    };
  }
  // Read the version from the bundle: running the CLI itself would launch the app.
  const plist = await run(
    '/usr/libexec/PlistBuddy',
    ['-c', 'Print :CFBundleShortVersionString', paths.plist],
    CHECK_TIMEOUT_MS,
  );
  const version = plist.ok ? firstVersion(plist.stdout) : undefined;
  const registered = path === paths.registered;
  const hint = registered
    ? ''
    : 'CLI not registered: Obsidian Settings, General, enable "Command line interface"';
  return { ...base, ok: true, version, path, registered, hint };
}

/**
 * The decisions backend the profile names, the one rules defer to when unsure (the named one,
 * else rules while it is unavailable), and the confidence below which they do.
 */
type DecisionsInUse = { named: BackendName; active: BackendName; threshold: number };

function decisionsCheck(decisions: DecisionsInUse | undefined): Probe[] {
  if (!decisions) return [];
  const { named, active, threshold } = decisions;
  const hint =
    named !== active
      ? `${named} is not available; decisions use ${active}`
      : active === 'rules'
        ? ''
        : `rules first; ${active} below confidence ${threshold}`;
  return [{ name: 'decisions', ok: true, version: active, hint }];
}

/** Mesa's Claude Code hooks: a warning with its fix when missing, or when settings do not read. */
function claudeHooksCheck(read: () => ClaudeHooksStatus): Probe {
  const name = 'claude hooks';
  let status: ClaudeHooksStatus;
  try {
    status = read();
  } catch (error) {
    return {
      name,
      ok: false,
      hint: `cannot read Claude Code's settings: ${toFail(error).error.message}`,
    };
  }
  const hint = status.installed
    ? ''
    : status.stale
      ? 'stale: they run a mesa that moved; run `mesa hooks install`'
      : 'not installed: run `mesa hooks install`';
  return { name, ok: status.installed, path: status.path, hint };
}

/**
 * The pane-died hook on Mesa's tmux server. With no server there is nothing to hook: fine, the
 * server gets it when it starts. A server without it (started by an older mesa, or by a mesa
 * that moved) is a warning.
 */
function tmuxHookCheck(status: TmuxHookStatus): Probe {
  const name = 'tmux hooks';
  if (!status.server) return { name, ok: true, hint: `no server on ${status.socket} yet` };
  const hint = status.paneDied
    ? ''
    : `not set on ${status.socket}: \`mesa sessions\` sets it on its next look at your sessions, \`mesa open\` with the next session`;
  return { name, ok: status.paneDied, hint };
}

function profileDirCheck(dir: string): Probe {
  const ok = existsSync(dir);
  return {
    name: 'profile dir',
    ok,
    path: dir,
    hint: ok ? '' : 'does not exist yet',
  };
}

/** Presence and version of every external dependency, plus the profile directory. */
export async function runDoctor(deps: {
  run: Runner;
  obsidian: ObsidianPaths;
  profileDir: string;
  /** Faro's backends; none before init. */
  decisions?: DecisionsInUse;
  /** Mesa's two kinds of hook, read side by side with the other checks. */
  hooks?: { claude: () => ClaudeHooksStatus; tmux: () => Promise<TmuxHookStatus> };
}): Promise<DoctorReport> {
  const [binaries, obsidian, hooks] = await Promise.all([
    Promise.all(BINARIES.map(async (b) => ({ role: b.role, check: await probe(deps.run, b) }))),
    obsidianCheck(deps.run, deps.obsidian),
    deps.hooks?.tmux(),
  ]);
  const anAgent = binaries.some((b) => b.role === 'agent' && b.check.ok);
  const healthy = anAgent && binaries.every((b) => b.role !== 'required' || b.check.ok);
  const blocking = (b: (typeof binaries)[number]) => b.role === 'required' || !anAgent;
  const checks: Check[] = [
    ...binaries.map((b) => ({ ...b.check, status: statusOf(b.check.ok, blocking(b)) })),
    ...[
      obsidian,
      profileDirCheck(deps.profileDir),
      ...decisionsCheck(deps.decisions),
      ...(deps.hooks && hooks ? [claudeHooksCheck(deps.hooks.claude), tmuxHookCheck(hooks)] : []),
    ].map((c) => ({
      ...c,
      status: statusOf(c.ok, false),
    })),
  ];
  return { healthy, summary: healthy ? 'ready' : REQUIREMENT, checks };
}

const statusOf = (ok: boolean, blocking: boolean): Check['status'] =>
  ok ? 'ok' : blocking ? 'fail' : 'warn';
