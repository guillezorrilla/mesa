import type { MesaContext } from '../context.js';
import { changeJson } from '../lib/json-file.js';
import { keptReport } from '../reports/report-delivery.js';
import { settle, TaskFile, type WorkerNews } from './task-file.js';

/**
 * The profile's `tasks.json`, changed under the profile lock so two processes both keep theirs
 * (CONTEXT.md, Task graph). Every change settles running tasks by their workers' reports and
 * endings first (settle), so a dependent is ready as soon as anyone looks.
 */
export function taskStore(ctx: MesaContext) {
  const newsOf = (worker: string): WorkerNews => {
    const record = ctx.store.find(worker);
    const report = keptReport(ctx, worker);
    return { ...(report ? { report } : {}), ended: !record || Boolean(record.endedAt) };
  };
  return {
    /** Changes the settled file with `fn`, which returns the next file and a result. */
    change: <R>(fn: (current: TaskFile) => { next: TaskFile; result: R }): R => {
      let result: R | undefined;
      changeJson(
        ctx.paths.tasks,
        TaskFile,
        (current) => {
          const changed = fn({
            tasks: settle(current?.tasks ?? [], newsOf, ctx.clock()),
            gates: current?.gates ?? [],
          });
          result = changed.result;
          return changed.next;
        },
        ctx,
      );
      return result as R;
    },
  };
}
