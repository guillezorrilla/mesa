import { existsSync } from 'node:fs';
import { listAgentProcesses } from '../../agents/listing.js';
import type { MesaContext } from '../../context.js';
import type { Faro } from '../../decisions/faro.js';
import { supervisingModel } from '../../decisions/supervision.js';
import { projectPriorities } from '../../projects/projects.js';
import { readRegistry } from '../../projects/registry.js';
import { listSessions } from '../board/board.js';
import { readHookEvents } from '../signals/hook-events.js';
import { placementStore } from '../signals/placements.js';
import { outputLog } from '../window/output-log.js';

/**
 * A look at the board for one profile: its sessions merged with live tmux and the agent listing,
 * each managed one saying whether it has an output log; ended ones only with `all`. `elsewhere`
 * is the agent session ids the home's other profiles hold.
 */
export function boardLook(ctx: MesaContext, faro: Faro, elsewhere: () => ReadonlySet<string>) {
  const { paths, open, store, tmux } = ctx;
  const placements = placementStore(paths.placements, ctx);
  return (all = false) => {
    // The chosen model, if it passed the supervision gate, places unsure rows beside the look.
    const provider = supervisingModel(ctx.configIfAny()?.decisions.model);
    return listSessions(
      {
        store,
        tmux,
        listing: () => listAgentProcesses(ctx),
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
      { all },
    ).then((rows) =>
      rows.map((row) =>
        row.managed ? { ...row, hasOutputLog: existsSync(outputLog(paths.logs, row.id)) } : row,
      ),
    );
  };
}
