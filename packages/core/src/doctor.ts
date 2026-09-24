import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';

export type Check = {
  name: string;
  required: boolean;
  ok: boolean;
  version?: string;
  hint: string;
  path?: string;
  registered?: boolean;
};

export type RunResult =
  | { ok: true; stdout: string }
  | { ok: false; reason: 'missing' | 'timeout' | 'failed'; detail: string };

/** Runs a binary with a timeout. Injected so tests never spawn anything. */
export type Runner = (file: string, args: string[], timeoutMs: number) => Promise<RunResult>;

export const execRunner: Runner = (file, args, timeoutMs) =>
  new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (!error) return resolve({ ok: true, stdout });
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT')
        return resolve({ ok: false, reason: 'missing', detail: error.message });
      if (error.killed) return resolve({ ok: false, reason: 'timeout', detail: error.message });
      resolve({ ok: false, reason: 'failed', detail: (stderr || error.message).trim() });
    });
  });

export const CHECK_TIMEOUT_MS = 2000;
export const AGENTS = ['claude', 'codex'] as const;
export const OBSIDIAN_REGISTERED = '/usr/local/bin/obsidian';
export const OBSIDIAN_BUNDLE = '/Applications/Obsidian.app/Contents/MacOS/obsidian-cli';
const OBSIDIAN_PLIST = '/Applications/Obsidian.app/Contents/Info.plist';

const firstVersion = (text: string) => text.match(/\d+\.\d+[\w.-]*/)?.[0];

async function binaryCheck(
  run: Runner,
  name: string,
  args: string[],
  required: boolean,
  install: string,
): Promise<Check> {
  const res = await run(name, args, CHECK_TIMEOUT_MS);
  if (res.ok) return { name, required, ok: true, version: firstVersion(res.stdout), hint: '' };
  const why =
    res.reason === 'missing'
      ? 'not found on PATH'
      : res.reason === 'timeout'
        ? `\`${name} ${args.join(' ')}\` did not answer within ${CHECK_TIMEOUT_MS / 1000} s`
        : `\`${name} ${args.join(' ')}\` failed: ${res.detail}`;
  return { name, required, ok: false, hint: `${why}; install with \`${install}\`` };
}

async function obsidianCheck(run: Runner, exists: (path: string) => boolean): Promise<Check> {
  const base = { name: 'obsidian', required: false };
  const path = [OBSIDIAN_REGISTERED, OBSIDIAN_BUNDLE].find(exists);
  if (!path) {
    return {
      ...base,
      ok: false,
      registered: false,
      hint: 'Obsidian 1.12.7+ not found in /Applications',
    };
  }
  // Read the version from the bundle: running the CLI itself would launch the app.
  const plist = await run(
    '/usr/libexec/PlistBuddy',
    ['-c', 'Print :CFBundleShortVersionString', OBSIDIAN_PLIST],
    CHECK_TIMEOUT_MS,
  );
  const version = plist.ok ? firstVersion(plist.stdout) : undefined;
  const registered = path === OBSIDIAN_REGISTERED;
  const hint = registered
    ? ''
    : 'CLI not registered: Obsidian Settings, General, enable "Command line interface"';
  return { ...base, ok: true, version, path, registered, hint };
}

/**
 * Presence and version of every external dependency plus the profile directory.
 * tmux is required and so is at least one agent (see `isHealthy`); the rest is informational.
 */
export async function checkEnvironment(opts: {
  profileDir: string;
  run?: Runner;
  exists?: (path: string) => boolean;
}): Promise<Check[]> {
  const { profileDir, run = execRunner, exists = existsSync } = opts;
  const checks = await Promise.all([
    binaryCheck(run, 'tmux', ['-V'], true, 'brew install tmux'),
    binaryCheck(run, 'claude', ['--version'], false, 'brew install --cask claude-code'),
    binaryCheck(run, 'codex', ['--version'], false, 'brew install --cask codex'),
    obsidianCheck(run, exists),
  ]);
  const dirOk = exists(profileDir);
  checks.push({
    name: 'profile dir',
    required: false,
    ok: dirOk,
    path: profileDir,
    hint: dirOk ? '' : 'does not exist yet',
  });
  return checks;
}

/** Every required check passes and at least one agent is installed. */
export function isHealthy(checks: Check[]): boolean {
  const agentOk = checks.some((c) => (AGENTS as readonly string[]).includes(c.name) && c.ok);
  return agentOk && checks.every((c) => !c.required || c.ok);
}
