import { z } from 'zod';
import { gitCommand } from '../git/command.js';
import { changeJson, readCache } from '../lib/json-file.js';
import type { LockDeps } from '../lib/lock-file.js';
import type { Runner } from '../lib/process.js';
import { toFail } from '../lib/result.js';

/** How long a fetch of a base is reused for the next new branch from it (#900). */
export const FETCH_REUSE_MS = 30_000;

const FETCH_MS = 60_000;

// When each repository's base was last fetched: "<repo> <base>" to an ISO time.
const Stamps = z.record(z.string(), z.string()).describe('fetch stamps');

/**
 * Fetches only `base` from its remote (`git fetch origin main` for `origin/main`) before a new
 * branch starts from it, unless `stamps` says it was fetched under FETCH_REUSE_MS ago. A base on
 * no remote is not fetched. A failed fetch is the returned warning: the branch starts from the
 * local ref.
 */
export async function fetchBase(
  run: Runner,
  lock: LockDeps,
  stamps: string,
  repo: string,
  base: string,
): Promise<string | undefined> {
  const remotes = await gitCommand(run, repo, ['remote']);
  // The longest name, so `foo/bar/main` is remote `foo/bar`'s main when `foo` is a remote too.
  const remote = remotes.ok
    ? remotes.stdout
        .split('\n')
        .filter((name) => name && base.startsWith(`${name}/`))
        .sort((a, b) => b.length - a.length)[0]
    : undefined;
  if (!remote) return undefined;
  const key = `${repo} ${base}`;
  const now = lock.clock().getTime();
  const fresh = (at: string | undefined) => now - Date.parse(at ?? '') < FETCH_REUSE_MS;
  if (fresh(readCache(stamps, Stamps, {})[key])) return undefined;
  let detail: string | undefined;
  try {
    const fetched = await gitCommand(
      run,
      repo,
      ['fetch', '--end-of-options', remote, base.slice(remote.length + 1)],
      FETCH_MS,
    );
    if (!fetched.ok) detail = fetched.detail;
  } catch (error) {
    detail = toFail(error).error.message;
  }
  if (detail) return `cannot fetch ${base}: ${detail}; started from the local ${base}`;
  try {
    changeJson(
      stamps,
      Stamps,
      (kept = {}) => ({
        ...Object.fromEntries(Object.entries(kept).filter(([, at]) => fresh(at))),
        [key]: new Date(now).toISOString(),
      }),
      lock,
    );
  } catch {
    // ponytail: an unwritten stamp only means the next new branch fetches again.
  }
  return undefined;
}
