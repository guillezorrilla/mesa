// What the decisions measurement scripts share (#465): stopping on a wrong argument or a refused
// step, and the worktree's built `mesa` CLI run against one throwaway profile, with config
// changes that are put back afterwards.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { profilePaths } from '../../packages/core/dist/profile/paths.js';

/** The worktree's built CLI. */
export const CLI = new URL('../../packages/cli/dist/mesa.js', import.meta.url).pathname;

/** A wrong argument, before anything is set up. */
export const usage = (message) => {
  console.error(message);
  process.exit(2);
};

/** Stops the run with `message`: thrown, so whatever was set up is put back first. */
export class Refused extends Error {}
export const fail = (message) => {
  throw new Refused(message);
};

/** Stops through `stop` (usage or fail) when the CLI is not built. */
export const needCli = (stop) => {
  if (!existsSync(CLI)) stop(`${CLI} is missing: pnpm --filter @mesa/cli build`);
};

/** An envelope's data, or a Refused saying `what` failed and why. */
export const must = (envelope, what) => {
  if (!envelope.ok) fail(`${what}: ${envelope.error?.message}`);
  return envelope.data;
};

/**
 * The CLI for `profile` (its paths too, when there is one): `mesa(...args)` runs it, each call
 * within `timeoutMs`, and returns its envelope, or one saying why there is none; `set(path, value,
 * before)` sets a config value and returns the step that puts `before` back.
 */
export function profileCli(profile, timeoutMs = 30_000) {
  const mesa = (...args) => {
    const run = spawnSync(process.execPath, [CLI, '--profile', profile, ...args], {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
    });
    try {
      return JSON.parse(run.stdout);
    } catch {
      return { ok: false, error: { message: (run.stderr || run.stdout || 'no output').trim() } };
    }
  };
  const set = (path, value, before) => {
    must(mesa('config', 'set', path, JSON.stringify(value), '--json'), `config set ${path}`);
    return () => mesa('config', 'set', path, JSON.stringify(before), '--json');
  };
  return { paths: profile ? profilePaths(homedir(), profile) : undefined, mesa, set };
}
