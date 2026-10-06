import { existsSync } from 'node:fs';
import { agentBinary } from '../agents/agents.js';
import type { hooksStatus as antigravityHooksStatus } from '../agents/antigravity/hooks.js';
import type { vaultMountStatus } from '../agents/antigravity/vault-mount.js';
import type { ClaudeHooksStatus } from '../agents/claude/hooks.js';
import type { CodexHooksStatus } from '../agents/codex/hooks.js';
import type { TmuxHookStatus } from '../agents/hooks-service.js';
import { AGENT_NAMES } from '../agents/names.js';
import type { BackendName } from '../decisions/types.js';
import type { Runner } from '../lib/process.js';
import { toFail } from '../lib/result.js';
import { TMUX_INSTALL } from '../sessions/tmux/backend.js';
import type { ObsidianPaths } from '../vault/obsidian.js';
import type { VaultStatus } from '../vault/vault.js';
import { type Binary, CHECK_TIMEOUT_MS, firstVersion, homebrewInstall, probe } from './probe.js';

export type Check = {
  name: string;
  ok: boolean;
  /** How to show the row: `fail` blocks Mesa, `warn` does not. */
  status: 'ok' | 'warn' | 'fail';
  version?: string;
  hint: string;
  path?: string;
  registered?: boolean;
  /** On a missing binary Mesa can install: its Homebrew command (`mesa doctor install`). */
  install?: string;
};

/** Decided here once: `healthy` when tmux and at least one agent answered; `summary` says why not. */
export type DoctorReport = { healthy: boolean; summary: string; checks: Check[] };

/** What a check found, before its status is set. */
type Finding = Omit<Check, 'status'>;

// tmux is required on its own; the agents are required as a group: at least one of them.
const BINARIES: Binary[] = [
  { name: 'tmux', args: ['-V'], role: 'required', install: TMUX_INSTALL },
  ...AGENT_NAMES.map((name) => agentBinary(name)),
];

/** The rows Mesa can install itself (`mesa doctor install`), each with its Homebrew command. */
export const INSTALLABLE = new Map(
  BINARIES.flatMap((b) => {
    const command = homebrewInstall(b);
    return command ? [[b.name, command] as const] : [];
  }),
);

const REQUIREMENT = `tmux and at least one agent (${AGENT_NAMES.join(' or ')}) are required`;

async function obsidianCheck(run: Runner, paths: ObsidianPaths): Promise<Finding> {
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

/** The decisions backend the profile names, and the confidence below which rules defer to it. */
type DecisionsInUse = { named: BackendName; threshold: number };

function decisionsCheck(decisions: DecisionsInUse | undefined): Finding[] {
  if (!decisions) return [];
  const { named, threshold } = decisions;
  const hint =
    named === 'rules' ? 'rules only' : `rules first; ${named} below confidence ${threshold}`;
  return [{ name: 'decisions', ok: true, version: named, hint }];
}

/** Mesa's Claude Code hooks: a warning with its fix when missing, or when settings do not read. */
function claudeHooksCheck(read: () => ClaudeHooksStatus): Finding {
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

/** Every Codex event's install and trust status, from the same reader as hooks status. */
function codexHooksChecks(read: () => CodexHooksStatus): Finding[] {
  try {
    const status = read();
    return Object.entries(status.events).map(([event, installed]) => ({
      name: `codex hooks ${event}`,
      ok: installed && status.trusted[event] === true,
      path: status.path,
      hint: !installed
        ? 'not installed: run `mesa hooks install`'
        : status.trusted[event]
          ? ''
          : status.hint,
    }));
  } catch (error) {
    return [{ name: 'codex hooks', ok: false, hint: toFail(error).error.message }];
  }
}

function antigravityHooksCheck(read: () => ReturnType<typeof antigravityHooksStatus>): Finding {
  const name = 'antigravity hooks';
  try {
    const status = read();
    return {
      name,
      ok: status.installed,
      path: status.path,
      hint: status.installed
        ? ''
        : status.stale
          ? 'stale: run `mesa hooks install`'
          : 'not installed: run `mesa hooks install`',
    };
  } catch (error) {
    return { name, ok: false, hint: toFail(error).error.message };
  }
}

/** The profile's vault: laid out, or what `mesa vault init` would still create. */
function vaultCheck(read: () => VaultStatus): Finding {
  try {
    const status = read();
    return {
      name: 'vault',
      ok: status.ok,
      path: status.path,
      hint: status.ok ? '' : `missing ${status.missing.join(', ')}: run \`mesa vault init\``,
    };
  } catch (error) {
    return { name: 'vault', ok: false, hint: toFail(error).error.message };
  }
}

/** Antigravity's global mesa-vault entry and its allow rule, from the same reader as hooks status. */
function antigravityVaultCheck(read: () => ReturnType<typeof vaultMountStatus>): Finding {
  const name = 'antigravity vault';
  try {
    const status = read();
    return {
      name,
      ok: status.installed && !status.disabled,
      path: status.path,
      hint: status.conflict
        ? status.conflict
        : status.stale
          ? 'stale: run `mesa hooks install`'
          : !status.server
            ? 'not installed: run `mesa hooks install`'
            : status.disabled
              ? 'disabled in Antigravity: its sessions have no vault tools'
              : status.rule
                ? ''
                : 'allow rule missing: run `mesa hooks install`',
    };
  } catch (error) {
    return { name, ok: false, hint: toFail(error).error.message };
  }
}

/**
 * The pane-died hook on Mesa's tmux server. With no server there is nothing to hook: fine, the
 * server gets it when it starts. A server without it (started by an older mesa, or by a mesa
 * that moved) is a warning.
 */
function tmuxHookCheck(status: TmuxHookStatus): Finding {
  const name = 'tmux hooks';
  if (!status.server) return { name, ok: true, hint: `no server on ${status.socket} yet` };
  const hint = status.paneDied
    ? ''
    : `not set on ${status.socket}: \`mesa sessions\` sets it on its next look at your sessions, \`mesa open\` with the next session`;
  return { name, ok: status.paneDied, hint };
}

/**
 * A Codex app-server daemon, while its socket is there: a warning, as a plain `codex` attaches to
 * it and runs its hooks there, with the daemon's environment. Mesa's own codex windows keep off it
 * (ADR-0003 amendment). None while no daemon runs.
 */
function codexDaemonCheck(socket: string | undefined): Finding[] {
  if (socket === undefined || !existsSync(socket)) return [];
  const hint =
    'a Codex app-server daemon runs: Mesa keeps its codex windows off it with a -c override, but a codex started without one attaches to it';
  return [{ name: 'codex daemon', ok: false, path: socket, hint }];
}

function profileDirCheck(dir: string): Finding {
  const ok = existsSync(dir);
  return {
    name: 'profile dir',
    ok,
    path: dir,
    hint: ok ? '' : 'does not exist yet',
  };
}

/** Doctor's findings could not reach the profile inbox: a warning, so doctor still answers. */
export function inboxCheck(error: unknown): Check {
  const hint = `cannot record findings in the inbox: ${toFail(error).error.message}`;
  return { name: 'inbox', ok: false, status: 'warn', hint };
}

/**
 * Presence and version of every external dependency, the profile directory, the decisions
 * backend, the native agent hooks, Antigravity's mesa-vault entry, the tmux pane-died hook, and a Codex
 * app-server daemon, when one runs.
 */
export async function runDoctor(deps: {
  run: Runner;
  obsidian: ObsidianPaths;
  profileDir: string;
  /** Faro's backends; none before init. */
  decisions?: DecisionsInUse;
  /** Mesa's agent and tmux hooks, read side by side with the other checks. */
  hooks?: {
    claude: () => ClaudeHooksStatus;
    codex?: () => CodexHooksStatus;
    antigravity?: () => ReturnType<typeof antigravityHooksStatus>;
    antigravityVault?: () => ReturnType<typeof vaultMountStatus>;
    tmux: () => Promise<TmuxHookStatus>;
  };
  /** Where a Codex app-server daemon's socket is while it runs. */
  codexDaemon?: string;
  /** The profile's vault layout; none before init. */
  vault?: () => VaultStatus;
}): Promise<DoctorReport> {
  const [binaries, obsidian, hooks] = await Promise.all([
    Promise.all(
      BINARIES.map(async (b) => ({
        role: b.role,
        install: INSTALLABLE.get(b.name),
        check: await probe(deps.run, b),
      })),
    ),
    obsidianCheck(deps.run, deps.obsidian),
    deps.hooks?.tmux(),
  ]);
  const anAgent = binaries.some((b) => b.role === 'agent' && b.check.ok);
  const healthy = anAgent && binaries.every((b) => b.role !== 'required' || b.check.ok);
  const blocking = (b: (typeof binaries)[number]) => b.role === 'required' || !anAgent;
  const checks: Check[] = [
    ...binaries.map((b) => ({
      ...b.check,
      status: statusOf(b.check.ok, blocking(b)),
      ...(!b.check.ok && b.install ? { install: b.install } : {}),
    })),
    ...[
      obsidian,
      profileDirCheck(deps.profileDir),
      ...decisionsCheck(deps.decisions),
      ...(deps.vault ? [vaultCheck(deps.vault)] : []),
      ...(deps.hooks && hooks ? [claudeHooksCheck(deps.hooks.claude), tmuxHookCheck(hooks)] : []),
      ...(deps.hooks?.codex ? codexHooksChecks(deps.hooks.codex) : []),
      ...(deps.hooks?.antigravity ? [antigravityHooksCheck(deps.hooks.antigravity)] : []),
      ...(deps.hooks?.antigravityVault ? [antigravityVaultCheck(deps.hooks.antigravityVault)] : []),
      ...codexDaemonCheck(deps.codexDaemon),
    ].map((c) => ({
      ...c,
      status: statusOf(c.ok, false),
    })),
  ];
  return { healthy, summary: healthy ? 'ready' : REQUIREMENT, checks };
}

const statusOf = (ok: boolean, blocking: boolean): Check['status'] =>
  ok ? 'ok' : blocking ? 'fail' : 'warn';
