import { existsSync } from 'node:fs';
import { AGENT_NAMES, AGENTS } from './agents.js';
import type { ObsidianPaths } from './obsidian.js';
import type { Runner } from './process.js';
import { TMUX_INSTALL } from './sessions/tmux.js';

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

export const CHECK_TIMEOUT_MS = 2000;

type Binary = {
  name: string;
  args: readonly string[];
  role: 'required' | 'agent';
  install: string;
};

// tmux is required on its own; the agents are required as a group: at least one of them.
const BINARIES: Binary[] = [
  { name: 'tmux', args: ['-V'], role: 'required', install: TMUX_INSTALL },
  ...AGENT_NAMES.map((name) => ({
    name,
    args: AGENTS[name].versionArgs,
    role: 'agent' as const,
    install: AGENTS[name].install,
  })),
];

const REQUIREMENT = `tmux and at least one agent (${AGENT_NAMES.join(' or ')}) are required`;

type Probe = Omit<Check, 'status'>;

const firstVersion = (text: string) => text.match(/\d+\.\d+[\w.-]*/)?.[0];

async function probe(run: Runner, b: Binary): Promise<Probe> {
  const res = await run(b.name, [...b.args], CHECK_TIMEOUT_MS);
  if (res.ok) return { name: b.name, ok: true, version: firstVersion(res.stdout), hint: '' };
  const command = `\`${b.name} ${b.args.join(' ')}\``;
  const why = {
    missing: 'not found on PATH',
    timeout: `${command} did not answer within ${CHECK_TIMEOUT_MS / 1000} s`,
    failed: `${command} failed: ${res.detail}`,
  }[res.reason];
  return { name: b.name, ok: false, hint: `${why}; install with \`${b.install}\`` };
}

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
}): Promise<DoctorReport> {
  const [binaries, obsidian] = await Promise.all([
    Promise.all(BINARIES.map(async (b) => ({ role: b.role, check: await probe(deps.run, b) }))),
    obsidianCheck(deps.run, deps.obsidian),
  ]);
  const anAgent = binaries.some((b) => b.role === 'agent' && b.check.ok);
  const healthy = anAgent && binaries.every((b) => b.role !== 'required' || b.check.ok);
  const blocking = (b: (typeof binaries)[number]) => b.role === 'required' || !anAgent;
  const checks: Check[] = [
    ...binaries.map((b) => ({ ...b.check, status: statusOf(b.check.ok, blocking(b)) })),
    ...[obsidian, profileDirCheck(deps.profileDir)].map((c) => ({
      ...c,
      status: statusOf(c.ok, false),
    })),
  ];
  return { healthy, summary: healthy ? 'ready' : REQUIREMENT, checks };
}

const statusOf = (ok: boolean, blocking: boolean): Check['status'] =>
  ok ? 'ok' : blocking ? 'fail' : 'warn';
