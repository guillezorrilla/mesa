import { join } from 'node:path';
import { type LockDeps, lockedBy, withLockSync } from '../lib/lock-file.js';
import { MesaError } from '../lib/result.js';
import type { SessionRecord } from './record.js';
import type { SessionStore } from './store.js';

/**
 * The lock over the sessions in `dir` that dependency edits and queue claims take
 * (`.dependencies.lock`), as the edits read and change several records at once.
 */
export const dependencyLock =
  (dir: string, lock: LockDeps) =>
  <T>(fn: () => T): T => {
    const path = join(dir, '.dependencies.lock');
    return withLockSync(lock, path, fn, () => lockedBy('session dependencies', path, 'session'));
  };

/** A parent is visual lineage; `after` is a start condition for a queued session. */
export function changeDependencies(
  store: SessionStore,
  id: string,
  change: { parent?: string | null; after?: string },
): SessionRecord {
  if (change.parent === undefined && change.after === undefined) {
    throw new MesaError('usage', 'pass a parent or a queued wait target');
  }
  return store.withDependencyLock(() => {
    const records = new Map(store.list().map((record) => [record.id, record]));
    const current = store.get(id);
    if (change.after !== undefined) {
      if (current.lastState.state !== 'queued' || !current.pending) {
        throw new MesaError('usage', `session ${id} is not queued`);
      }
      if (current.pending.claimedAt) {
        throw new MesaError('usage', `session ${id} is starting; edit it after it starts`);
      }
    }
    for (const field of ['parent', 'after'] as const) {
      const target = change[field];
      if (!target) continue;
      if (!records.has(target)) throw new MesaError('not_found', `no session ${target}`);
      const seen = new Set([id]);
      let next: string | undefined = target;
      while (next) {
        if (seen.has(next)) {
          throw new MesaError('usage', `${field} ${target} would create a cycle`);
        }
        seen.add(next);
        next = records.get(next)?.[field];
      }
    }
    return store.update(id, {
      ...(change.parent === undefined ? {} : { parent: change.parent ?? undefined }),
      ...(change.after === undefined ? {} : { after: change.after }),
    });
  });
}
