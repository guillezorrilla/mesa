import { antigravitySessionId } from '../../agents/antigravity/log.js';
import { listAgentProcesses } from '../../agents/listing.js';
import type { MesaContext } from '../../context.js';
import { sessionTree } from '../board/tree.js';
import { refreshContext } from '../context-use.js';
import { discoverNative } from '../discovery.js';
import { applyEach } from '../each.js';
import { projectScope } from '../general.js';
import { sessionGoal } from '../goal.js';
import { nativeHistory } from '../history.js';
import { readHookEvents } from '../hook-events.js';
import { instructionStatus } from '../instructions.js';
import { sessionLog } from '../output-log.js';
import { recordAgent } from '../record.js';
import { renameSession } from '../rename.js';
import { searchConversations } from '../search.js';
import { vaultStatus } from '../vault-status.js';
import { setWorkflowStatus } from '../workflow.js';
import type { SessionDeps } from './deps.js';
import type { lifecycleActions } from './lifecycle.js';

/**
 * The board's side of sessions: what it lists, shows, and finds of them, natively too, and what
 * it shows them by (a name, a workflow status, and whether they are archived).
 */
export function inspectActions(
  ctx: MesaContext,
  deps: SessionDeps,
  /** The lifecycle's stop: archiving a live session ends it. */
  stop: ReturnType<typeof lifecycleActions>['stop'],
) {
  const { paths, store, record } = ctx;
  const { contextDeps, nativeDeps } = deps;
  const { board } = deps.ends;
  /** Ends a live session at once and hides it from the board, keeping its record and logs. */
  const archive = async (id: string) => {
    const found = store.get(id);
    if (!found.archivedAt && !found.endedAt) await stop(id, true);
    return record(
      {
        type: 'session',
        summary: () => `Archived session ${id}`,
        failure: `Could not archive session ${id}`,
        project: (r) => projectScope(r.project),
        session: () => id,
        agent: (r) => recordAgent(r),
        inputs: { id },
        outputs: (r) => ({ archivedAt: r.archivedAt }),
        changed: () => !found.archivedAt,
      },
      () =>
        store.update(id, (current) => ({
          archivedAt: current.archivedAt ?? ctx.clock().toISOString(),
        })),
    );
  };
  return {
    list: board,
    /** The board as a tree: children under their parent, each row with its depth. */
    tree: async (all = false) => sessionTree(await board(all)),
    /** A session's goal, or not_found when it was started without one. */
    goal: (id: string) => sessionGoal(store, id),
    /**
     * A session's output as plain text, its last `tail` lines when given (sessionLog); not_found
     * for an unknown id.
     */
    logs: (id: string, tail?: number) => {
      store.get(id);
      return sessionLog(ctx, paths.logs, id, tail);
    },
    /**
     * One session's record, its context use read now, with `alive` as the board reads it, and
     * whether its instruction hook and its mesa-vault mount are configured; not_found for an
     * unknown id.
     */
    show: async (id: string) => {
      store.get(id);
      const row = (await board(true)).find((r) => r.id === id);
      // The look may have learned a provider-owned ID before its context can be read.
      refreshContext(contextDeps, store.get(id));
      // Read again: the look may have saved a new state, or started it from its queue.
      const current = store.get(id);
      const latestAntigravityId =
        current.agent === 'antigravity'
          ? antigravitySessionId({ logs: paths.logs }, current, new Set(), true)
          : undefined;
      const identityEvents = readHookEvents(paths.events, id);
      return {
        ...current,
        alive: row?.alive ?? false,
        instructions: instructionStatus(
          current.agent,
          ctx.home,
          ctx.env,
          ctx.self,
          identityEvents.some((event) => event.event === 'SessionIdentityChanged') ||
            Boolean(
              current.agentSessionId &&
                latestAntigravityId &&
                latestAntigravityId !== current.agentSessionId,
            ) ||
            (identityEvents.some((event) => event.event === 'SessionIdentityAmbiguous')
              ? 'ambiguous'
              : false),
        ),
        vault: vaultStatus(current, ctx.home, ctx.self),
      };
    },
    /** Gives a session the name a person calls it by; the board shows it in place of the id. */
    rename: (id: string, name: string) =>
      record(
        {
          type: 'session',
          summary: (r) => `Renamed session ${id} to ${r.name}`,
          failure: `Could not rename session ${id}`,
          project: (r) => projectScope(r.project),
          session: () => id,
          inputs: { id, name },
          outputs: (r) => ({ name: r.name }),
        },
        () => renameSession(store, id, name),
      ),
    workflow: (id: string, status: string) =>
      record(
        {
          type: 'session',
          summary: (r) => `Set session ${id} workflow to ${r.workflowStatus ?? 'unassigned'}`,
          failure: `Could not set session ${id} workflow`,
          project: (r) => projectScope(r.project),
          session: () => id,
          inputs: { id, status },
          outputs: (r) => ({ workflowStatus: r.workflowStatus ?? null }),
        },
        () => setWorkflowStatus(store, id, status),
      ),
    archive,
    /**
     * Archives each id through `archive`, one session receipt each; an unknown id refuses them
     * all before any is archived.
     */
    archiveEach: (ids: readonly string[]) =>
      applyEach(
        ids,
        (id) => store.find(id) !== undefined,
        async (id) => {
          const recorded = await archive(id);
          return { ...recorded.result, receipt: recorded.receipt, warning: recorded.warning };
        },
      ),
    unarchive: (id: string) => {
      const found = store.get(id);
      return record(
        {
          type: 'session',
          summary: () => `Unarchived session ${id}`,
          failure: `Could not unarchive session ${id}`,
          project: (r) => projectScope(r.project),
          session: () => id,
          agent: (r) => recordAgent(r),
          inputs: { id },
          outputs: () => ({ archivedAt: null }),
          changed: () => Boolean(found.archivedAt),
        },
        () => store.update(id, { archivedAt: undefined }),
      );
    },
    /** Native provider conversations on disk for a project, with import ownership. */
    history: (project: string) => nativeHistory(nativeDeps(), project),
    /** Native projects, running sessions and conversations of the last `days`, machine-wide. */
    discover: (days: number) =>
      discoverNative(
        { ...nativeDeps(), clock: ctx.clock, listing: () => listAgentProcesses(ctx) },
        { days },
      ),
    /** Bounded local text search over native provider conversations. */
    search: (project: string, query: string) => searchConversations(nativeDeps(), project, query),
  };
}
