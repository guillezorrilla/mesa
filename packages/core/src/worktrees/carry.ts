import { cpSync, lstatSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { createCheckedFilePath } from '../files/path.js';
import { gitCommand } from '../git/command.js';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';

/**
 * What one worktree's carry may copy in all, measured before each entry: a plain copy within
 * `bytes` and `entries`, and every entry, cloned or copied, within `cloneEntries`. An APFS clone
 * takes almost no disk, so it is charged entries only (#983).
 */
export const CARRY_BUDGET = { bytes: 2 * 1024 ** 3, entries: 50_000, cloneEntries: 250_000 };

type Budget = typeof CARRY_BUDGET;

// A clone of a large node_modules is quick, but not instant.
const CLONE_MS = 120_000;

/**
 * Copies each ignored, untracked file or folder in `entries` from `repo` into the new `worktree`,
 * as an APFS clone where it can (CARRY_BUDGET). One out of what is left of `budget` stops the
 * carry there: it and the rest stay behind, and the returned warning names it and why. Anything
 * unsafe to carry throws.
 */
export async function carryEntries(
  run: Runner,
  repo: string,
  worktree: string,
  entries: readonly string[],
  budget = CARRY_BUDGET,
): Promise<string | undefined> {
  // Every entry is checked first, so one unsafe after a stop is still refused.
  const sources: string[] = [];
  for (const entry of entries) sources.push(await carrySource(run, repo, worktree, entry));
  const left = { ...budget };
  for (const [index, entry] of entries.entries()) {
    const source = sources[index] as string;
    const over = await carryEntry(run, source, () => createCheckedFilePath(worktree, entry), {
      left,
      budget,
    });
    if (over) {
      const rest = entries.length - index - 1;
      return `carry stopped at ${entry}: ${over}; ${rest ? `it and ${rest} after it were` : 'it was'} not carried`;
    }
  }
  return undefined;
}

/** The checked source of `entry`: a local file or folder in `repo`, ignored and untracked. */
async function carrySource(run: Runner, repo: string, worktree: string, entry: string) {
  const source = join(repo, entry);
  const stat = lstatSync(source, { throwIfNoEntry: false });
  if (!stat || stat.isSymbolicLink() || !(stat.isFile() || stat.isDirectory()))
    throw new MesaError('usage', `${entry} is not a local file or folder to carry`);
  const actual = realpathSync.native(source);
  const within = relative(realpathSync.native(repo), actual);
  if (
    !within ||
    within.startsWith('..') ||
    isAbsolute(within) ||
    realpathSync.native(worktree).startsWith(`${actual}/`)
  )
    throw new MesaError('usage', `${entry} is not safe to carry`);
  const ignored = await gitCommand(run, repo, ['check-ignore', '-q', '--', entry]);
  const tracked = await gitCommand(run, repo, ['ls-files', '--cached', '--', entry]);
  if (!ignored.ok || !tracked.ok || tracked.stdout.trim())
    throw new MesaError('usage', `${entry} must be ignored and untracked to carry`);
  return source;
}

/** `n` of a limit, as the warning names it. */
const limit = (n: number, unit: 'entries' | 'bytes') =>
  unit === 'entries'
    ? `${n.toLocaleString('en-US')} entries`
    : n >= 1024 ** 3
      ? `${Number((n / 1024 ** 3).toFixed(1))} GiB`
      : `${n} bytes`;

/** `source`'s bytes and entries, or undefined once it has more than `cap` entries. */
function measure(source: string, cap: number) {
  let bytes = 0;
  let entries = 0;
  const pending = [source];
  for (let path = pending.pop(); path !== undefined; path = pending.pop()) {
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat) continue;
    if (++entries > cap) return undefined;
    if (stat.isDirectory()) for (const name of readdirSync(path)) pending.push(join(path, name));
    else if (!stat.isSymbolicLink()) bytes += stat.size;
  }
  return { bytes, entries };
}

/**
 * Carries `source` to `target()` within what is `left` of `budget`, taking its share, or says
 * which limit it passes and takes nothing. A clone that times out is removed and named, as a
 * second, slower copy would only take longer.
 */
async function carryEntry(
  run: Runner,
  source: string,
  target: () => string,
  { left, budget }: { left: Budget; budget: Budget },
) {
  const size = measure(source, left.cloneEntries);
  if (!size) return `the carry would pass ${limit(budget.cloneEntries, 'entries')}`;
  const to = target();
  // shortcut: no APFS probe; cp -c fails off APFS (or off macOS), and the plain copy takes over.
  const cloned = await run('/bin/cp', ['-c', '-R', '-n', source, to], CLONE_MS);
  if (cloned.ok) {
    left.cloneEntries -= size.entries;
    return undefined;
  }
  rmSync(to, { recursive: true, force: true });
  if (cloned.reason === 'timeout') return `the copy took over ${CLONE_MS / 1000} s`;
  if (size.entries > left.entries)
    return `a plain copy would pass ${limit(budget.entries, 'entries')}`;
  if (size.bytes > left.bytes) return `a plain copy would pass ${limit(budget.bytes, 'bytes')}`;
  left.entries -= size.entries;
  left.bytes -= size.bytes;
  left.cloneEntries -= size.entries;
  // verbatimSymlinks: a relative link such as pnpm's node_modules/pkg -> ../packages/pkg stays
  // relative, so the worktree uses its own packages rather than the source checkout's.
  cpSync(source, to, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
    errorOnExist: true,
    force: false,
  });
  return undefined;
}
