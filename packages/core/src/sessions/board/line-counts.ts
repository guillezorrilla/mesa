import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { readSessionDiff } from '../../git/branch-diff.js';
import { gitCommand } from '../../git/command.js';
import { diffCounts } from '../../git/diff.js';
import { changeJson, readCache } from '../../lib/json-file.js';
import type { LockDeps } from '../../lib/lock-file.js';
import { mapLimit } from '../../lib/map-limit.js';
import type { Runner } from '../../lib/process.js';
import type { Profile } from '../../profile/profile.js';
import { findProject } from '../../projects/projects.js';
import { sessionFolder } from '../record/folder.js';
import { projectScope } from '../record/general.js';
import type { ManagedRow, SessionRow } from './rows.js';

/** The lines a session's checkout added and removed since it left its base. */
export type LineCounts = { added: number; removed: number };

const Cache = z
  .record(
    z.string(),
    z.strictObject({ key: z.string(), at: z.string(), added: z.number(), removed: z.number() }),
  )
  .describe('line counts');

type Deps = LockDeps & { run: Runner; profile: () => Profile; file: string };

/** The checkout `row`'s agent works in, and its project; none for a General or terminal session. */
function checkoutOf(deps: Deps, row: ManagedRow) {
  const project = projectScope(row.project);
  if (!project || row.agent === 'terminal') return undefined;
  const folder = sessionFolder(row) ?? findProject(deps.profile(), project).path;
  return { project, folder };
}

/**
 * What says the checkout's diff may have changed: its HEAD, its index's mtime, and the session's
 * last state change, as an agent's edits end with its turn. One git call.
 */
async function stateKey(run: Runner, folder: string, row: ManagedRow) {
  const read = await gitCommand(run, folder, ['rev-parse', 'HEAD', '--git-path', 'index']);
  if (!read.ok) return undefined;
  const [head, index = ''] = read.stdout.trim().split('\n');
  if (!head) return undefined;
  let mtime = 0;
  try {
    mtime = statSync(resolve(folder, index)).mtimeMs;
  } catch {
    // No index yet: nothing staged ever.
  }
  return `${head}:${mtime}:${row.lastState.at}`;
}

/** The checkout's diff as `mesa diff` reads it (readSessionDiff), counted as its crew row is. */
const measure = async (deps: Deps, row: ManagedRow, project: string, folder: string) =>
  diffCounts((await readSessionDiff(deps.profile(), deps.run, { ...row, project, folder })).rows);

/** How many sessions' checkouts a look reads at once. */
const AT_ONCE = 4;

/**
 * Each Mesa session row with the lines its checkout added and removed since its base (committed,
 * uncommitted and untracked, as its crew row counts them), cached in `file` per session by its
 * checkout's HEAD, index mtime and its last state change, so a look with nothing changed runs no
 * diff. A session
 * at rest whose state has not changed since its count is not read again (as its readings are
 * not: listSessions); an ended one keeps its last count; a General or terminal session, or a
 * checkout Git cannot read, has none. Four checkouts are read at once.
 * shortcut: entries are never pruned (one small entry per session); prune by age if it grows.
 */
export async function withLineCounts(deps: Deps, rows: SessionRow[]): Promise<SessionRow[]> {
  const fresh: Record<string, { key: string; at: string } & LineCounts> = {};
  // A count is never worth failing the board over: a row it cannot read keeps none.
  try {
    const cached = readCache(deps.file, Cache, {});
    const count = async (row: SessionRow): Promise<SessionRow> => {
      if (!row.managed) return row;
      const checkout = checkoutOf(deps, row);
      if (!checkout) return row;
      const kept = cached[row.id];
      const resting = row.lastState.state !== 'working' && kept?.at === row.lastState.at;
      if (row.endedAt || resting) return kept ? { ...row, lines: countsOf(kept) } : row;
      const key = await stateKey(deps.run, checkout.folder, row);
      if (!key) return row;
      if (kept?.key === key) return { ...row, lines: countsOf(kept) };
      const lines = await measure(deps, row, checkout.project, checkout.folder);
      if (!lines) return row;
      fresh[row.id] = { key, at: row.lastState.at, ...lines };
      return { ...row, lines };
    };
    const counted = await mapLimit(rows, AT_ONCE, (row) => count(row).catch(() => row));
    try {
      if (Object.keys(fresh).length)
        changeJson(deps.file, Cache, (current = {}) => ({ ...current, ...fresh }), deps);
    } catch {
      // Not kept (a busy lock): this look still shows them, and the next measures again.
    }
    return counted;
  } catch {
    // A cache that cannot be read: this look has no counts, the next tries again.
    return rows;
  }
}

const countsOf = ({ added, removed }: LineCounts) => ({ added, removed });
