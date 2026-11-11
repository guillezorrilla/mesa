import { existsSync } from 'node:fs';
import { keptListing } from '../../agents/kept-listing.js';
import type { MesaContext } from '../../context.js';
import type { Faro } from '../../decisions/faro.js';
import { automaticGate } from '../../decisions/site-mode.js';
import { supervisingModel } from '../../decisions/supervision.js';
import { projectPriorities } from '../../projects/projects.js';
import { readRegistry } from '../../projects/registry.js';
import { latestReports } from '../../reports/report-delivery.js';
import { taskStore } from '../../tasks/task-store.js';
import { listSessions, type SessionScope } from '../board/board.js';
import { withCrewNews } from '../board/crew.js';
import { withLineCounts } from '../board/line-counts.js';
import { withPullRequests } from '../board/pull-requests.js';
import { readHookEvents } from '../signals/hook-events.js';
import { placementStore } from '../signals/placements.js';
import { FRESH_MS } from '../signals/state.js';
import { outputLog } from '../window/output-log.js';

/**
 * A look at the board for one profile: its sessions merged with live tmux and the agent listing,
 * each managed one saying whether it has an output log, the lines its checkout changed
 * (withLineCounts), its branch's pull request (withPullRequests), and a child its task's title and
 * newest report as last written (withCrewNews), in `scope` (listSessions). `elsewhere`
 * is the agent session ids the home's other profiles hold.
 */
export function boardLook(ctx: MesaContext, faro: Faro, elsewhere: () => ReadonlySet<string>) {
  const { paths, open, store, tmux } = ctx;
  const placements = placementStore(paths.placements, ctx);
  const listing = keptListing({ ...ctx, file: paths.listing, maxAgeMs: FRESH_MS });
  return (scope: SessionScope = 'board') => {
    // The chosen model, if it runs supervision automatically, places unsure rows beside the look.
    const decisions = ctx.configIfAny()?.decisions;
    const provider = supervisingModel(
      decisions?.model,
      automaticGate(decisions?.experimental ?? false),
    );
    return listSessions(
      {
        store,
        tmux,
        listing,
        projects: readRegistry(paths.registry),
        elsewhere,
        events: (id) => readHookEvents(paths.events, id),
        priorityOf: projectPriorities(open),
        faro: faro.profile(),
        ...(provider ? { supervision: { provider, look: placements.look } } : {}),
        clock: ctx.clock,
        env: ctx.env,
        home: ctx.home,
        logs: paths.logs,
      },
      { scope },
    )
      .then((rows) => withLineCounts({ ...ctx, profile: open, file: paths.lineCounts }, rows))
      .then((rows) => withPullRequests({ ...ctx, profile: open, file: paths.prBranches }, rows))
      .then((rows) => withCrewNews(rows, taskStore(ctx).peek().tasks, latestReports(ctx, false)))
      .then((rows) =>
        rows.map((row) =>
          row.managed ? { ...row, hasOutputLog: existsSync(outputLog(paths.logs, row.id)) } : row,
        ),
      );
  };
}
