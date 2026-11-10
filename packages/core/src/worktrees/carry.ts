import { cpSync, lstatSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { createCheckedFilePath } from '../files/path.js';
import { gitCommand } from '../git/command.js';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';

/** What one worktree's carry may copy in all, measured before each entry. */
export const CARRY_BUDGET = { bytes: 2 * 1024 ** 3, entries: 50_000 };

// A clone of a large node_modules is quick, but not instant.
const CLONE_MS = 120_000;

/**
 * Copies each ignored, untracked file or folder in `entries` from `repo` into the new `worktree`,
 * as an APFS clone where it can. One out of what is left of `budget` stops the carry there: it and
 * the rest stay behind, and the returned warning names it and why. Anything unsafe to carry throws.
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
    const target = createCheckedFilePath(worktree, entry);
    const over = spend(source, left, budget) ?? (await copyEntry(run, source, target));
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

type Budget = typeof CARRY_BUDGET;

/** Takes `source`'s size from `left`, or says which of `budget`'s limits it passes and takes nothing. */
function spend(source: string, left: Budget, budget: Budget) {
  let bytes = 0;
  let entries = 0;
  const pending = [source];
  for (let path = pending.pop(); path !== undefined; path = pending.pop()) {
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat) continue;
    if (++entries > left.entries)
      return `the carry would pass ${budget.entries.toLocaleString('en-US')} entries`;
    if (stat.isDirectory()) for (const name of readdirSync(path)) pending.push(join(path, name));
    else if (!stat.isSymbolicLink()) bytes += stat.size;
    if (bytes > left.bytes)
      return `the carry would pass ${budget.bytes >= 1024 ** 3 ? `${Number((budget.bytes / 1024 ** 3).toFixed(1))} GiB` : `${budget.bytes} bytes`}`;
  }
  left.bytes -= bytes;
  left.entries -= entries;
  return undefined;
}

/**
 * Clones `source` to `target`, which createCheckedFilePath found absent, else copies it; a clone
 * that times out is removed and named, as a second, slower copy would only take longer.
 */
async function copyEntry(run: Runner, source: string, target: string) {
  // shortcut: no APFS probe; cp -c fails off APFS (or off macOS), and the plain copy takes over.
  const cloned = await run('/bin/cp', ['-c', '-R', '-n', source, target], CLONE_MS);
  if (cloned.ok) return undefined;
  rmSync(target, { recursive: true, force: true });
  if (cloned.reason === 'timeout') return `the copy took over ${CLONE_MS / 1000} s`;
  // verbatimSymlinks: a relative link such as pnpm's node_modules/pkg -> ../packages/pkg stays
  // relative, so the worktree uses its own packages rather than the source checkout's.
  cpSync(source, target, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
    errorOnExist: true,
    force: false,
  });
  return undefined;
}
