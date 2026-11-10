import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { gitCommand } from '../git/command.js';
import { writeFileAtomic } from '../lib/atomic-file.js';
import type { Clock } from '../lib/clock.js';
import { readJson } from '../lib/json-file.js';
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
  clock: Clock,
  stamps: string,
  repo: string,
  base: string,
): Promise<string | undefined> {
  const remotes = await gitCommand(run, repo, ['remote']);
  const remote = remotes.ok
    ? remotes.stdout.split('\n').find((name) => name && base.startsWith(`${name}/`))
    : undefined;
  if (!remote) return undefined;
  const key = `${repo} ${base}`;
  let kept: Record<string, string> = {};
  try {
    kept = readJson(stamps, Stamps) ?? {};
  } catch {
    kept = {};
  }
  const now = clock().getTime();
  if (now - Date.parse(kept[key] ?? '') < FETCH_REUSE_MS) return undefined;
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
  const fresh = Object.fromEntries(
    Object.entries(kept).filter(([, at]) => now - Date.parse(at) < FETCH_REUSE_MS),
  );
  try {
    mkdirSync(dirname(stamps), { recursive: true });
    writeFileAtomic(stamps, JSON.stringify({ ...fresh, [key]: new Date(now).toISOString() }));
  } catch {
    // ponytail: an unwritten stamp only means the next new branch fetches again.
  }
  return undefined;
}
