import { MesaError } from '../lib/result.js';
import type { sessionsService } from '../sessions/service.js';
import type { importService } from './import-service.js';
import { itemGoal } from './item-goal.js';

// A session started from an imported item (CONTEXT.md, Import): its goal built from the item,
// and the item kept on its record.

type Imports = ReturnType<typeof importService>;
type Open = ReturnType<typeof sessionsService>['sessions']['open'];

/** What `mesa open --from` takes beyond the start's own options. */
export type ItemOpenOptions = Omit<NonNullable<Parameters<Open>[1]>, 'from'> & {
  /** The item: its id, or a link (or key) to it, imported first when it is not yet. */
  from: string;
  /** Write notes when it is imported first; on by default. */
  notes?: boolean;
  /** `goal` is the whole goal (the app's edited one), not added after the item's. */
  exactGoal?: boolean;
};

/** Starts sessions from `item`s, through `open`. */
export function itemSessions(item: Imports['item'], open: Open) {
  return {
    /** The goal a session started from `from` gets, and the item, without starting it. */
    goal: async (project: string, from: string) => {
      const found = await item(project, from);
      return { source: found.source, id: found.id, title: found.title, goal: itemGoal(found) };
    },
    /**
     * Starts a session on `project` from the item `from` names, importing it first when it is
     * not yet. Its goal is the item's (itemGoal), then `goal`; the record keeps the item's
     * `source` and `id`. --goal-file, --general, and --terminal are refused before any import.
     */
    open: async (project: string | undefined, opts: ItemOpenOptions) => {
      const { from, notes = true, exactGoal, goal, ...start } = opts;
      if (start.goalFile !== undefined) {
        throw new MesaError('usage', 'pass --from or --goal-file, not both');
      }
      if (project === undefined || start.general || start.terminal) {
        throw new MesaError(
          'usage',
          '--from needs a project, and cannot use --general or --terminal',
        );
      }
      const found = await item(project, from, { notes });
      return open(project, {
        ...start,
        goal: exactGoal ? goal : itemGoal(found, goal),
        from: { source: found.source, id: found.id },
      });
    },
  };
}
