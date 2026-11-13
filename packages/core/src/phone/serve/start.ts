import type { z } from 'zod';
import type { GuardrailCheck } from '../../decisions/guardrail.js';
import { MesaError } from '../../lib/result.js';
import type { ProjectRow } from '../../projects/projects.js';
import type { Recorded } from '../../receipts/recorder.js';
import type { SessionRecord } from '../../sessions/record/record.js';
import type { ItemOpenOptions } from '../../sources/item-session.js';
import type { WorktreeRow } from '../../worktrees/inventory.js';
import type { CallResult } from '../protocol/rpc.js';
import { type StartCall, startCalls } from '../protocol/start.js';
import { guardrailStop } from './answer-steer.js';
import { type HistoryDeps, phoneHistory } from './history.js';
import { phoneTicket, phoneTickets, type TicketDeps } from './tickets.js';

/**
 * The functions the CLI uses to start work (`mesa projects`, `worktrees`, `open`, and the
 * tickets' and native history's), each as a person calls it.
 */
export type StartDeps = TicketDeps &
  Omit<HistoryDeps, 'projects'> & {
    projects: () => ProjectRow[];
    worktrees: (project: string) => Promise<WorktreeRow[]>;
    /** `mesa open`, with `--from`; `guardrail` puts its goal through the guardrail first. */
    open: (project: string, opts: ItemOpenOptions) => Promise<Recorded<SessionRecord>>;
  };

type StartCallOf = z.infer<(typeof startCalls)[number]>;
const START_METHODS = new Set<string>(startCalls.map((call) => call.shape.method.value));
export const isStartCall = (call: { method: string }): call is StartCallOf =>
  START_METHODS.has(call.method);

const shown = (deps: StartDeps) => deps.projects().filter((p) => !p.hidden);

/** `mesa open` from the phone: past the guardrail, or its ask or block, which opens nothing. */
async function start(deps: StartDeps, call: StartCall): Promise<CallResult<'start'>> {
  const { project, goal, agent, place, branch, checkout, after, from, yes } = call;
  try {
    const { result } = await deps.open(project, {
      ...(goal.trim() ? { goal } : {}),
      ...(agent ? { agent } : {}),
      ...(place === 'worktree'
        ? branch?.trim()
          ? { branch: branch.trim() }
          : { worktree: true }
        : {}),
      ...(place === 'existing' && checkout ? { checkout } : {}),
      ...(after ? { after } : {}),
      // Its goal is the person's own words after the ticket's, as `open --from` builds it.
      // ponytail: imported with no Write notes run, which takes minutes and the phone waits 10 s;
      // the session reads the ticket's snapshot. Run notes in the background if they are missed.
      // The import comes before the guardrail, so an ask or a block leaves the ticket imported.
      ...(from ? { from, notes: false } : {}),
      noParent: true,
      guardrail: { yes: yes ?? false },
    });
    return { status: 'started', session: result.id };
  } catch (error) {
    if (!(error instanceof MesaError) || error.code !== 'guardrail_blocked') throw error;
    return guardrailStop(error.details as GuardrailCheck);
  }
}

/** Answers one start call (#1065); throws a MesaError for an unknown project or ticket. */
export async function answerStartCall(deps: StartDeps, call: StartCallOf): Promise<unknown> {
  switch (call.method) {
    case 'projects':
      return {
        projects: shown(deps).map((p) => ({ name: p.name, label: p.label })),
      } satisfies CallResult<'projects'>;
    case 'worktrees':
      return {
        worktrees: (await deps.worktrees(call.project)).flatMap((w) =>
          !w.main && w.branch ? [{ path: w.path, branch: w.branch }] : [],
        ),
      } satisfies CallResult<'worktrees'>;
    case 'start':
      return start(deps, call);
    case 'tickets':
      return phoneTickets(deps, call.project);
    case 'ticket':
      return phoneTicket(deps, call.id, call.site);
    case 'assign':
      return {
        assignee: (await deps.assign(call.id, call.site)).result.assignee,
      } satisfies CallResult<'assign'>;
    case 'history':
      return phoneHistory(
        { ...deps, projects: () => shown(deps).map((p) => p.name) },
        call.query?.trim() || undefined,
      );
    case 'adopt':
      return {
        session: (await deps.adopt(call.id, { project: call.project })).result.record.id,
      } satisfies CallResult<'adopt'>;
  }
}
