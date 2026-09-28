import { existsSync, realpathSync } from 'node:fs';
import { gitWorktrees, resolveCheckout } from '../git/checkout.js';
import type { Runner } from '../lib/process.js';
import type { Profile } from '../profile/profile.js';
import { checkoutHolders } from '../sessions/holders.js';
import type { SessionStore } from '../sessions/store.js';

export type WorktreeRow = {
  path: string;
  branch?: string;
  head?: string;
  main: boolean;
  state: 'ready' | 'locked' | 'stale' | 'detached';
  holders: { id: string; name?: string; state: string; at: string }[];
};
export type WorktreeFilter = { branch?: string; holder?: string; state?: WorktreeRow['state'] };

/** Git's inventory joined to unfinished sessions in this profile, including the main checkout. */
export async function listWorktrees(
  profile: Profile,
  run: Runner,
  store: SessionStore,
  project: string,
  filter: WorktreeFilter = {},
): Promise<WorktreeRow[]> {
  const root = (await resolveCheckout(profile, run, project)).path;
  const records = store.list();
  const rows = await gitWorktrees(run, root);
  return rows
    .map((row): WorktreeRow => {
      const available = existsSync(row.path);
      const path = available ? realpathSync.native(row.path) : row.path;
      const main = path === root;
      const holders = checkoutHolders(records, project, root, path).map((session) => ({
        id: session.id,
        ...(session.name ? { name: session.name } : {}),
        state: session.lastState.state,
        at: session.lastState.at,
      }));
      return {
        path,
        ...(row.branch ? { branch: row.branch } : {}),
        ...(row.head ? { head: row.head } : {}),
        main,
        state:
          !available || row.prunable !== undefined
            ? 'stale'
            : row.locked !== undefined
              ? 'locked'
              : row.detached
                ? 'detached'
                : 'ready',
        holders,
      };
    })
    .filter(
      (row) =>
        (!filter.branch || row.branch?.includes(filter.branch)) &&
        (!filter.holder || row.holders.some((holder) => holder.id === filter.holder)) &&
        (!filter.state || row.state === filter.state),
    );
}
