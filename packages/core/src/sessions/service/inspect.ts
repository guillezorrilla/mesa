import { antigravitySessionId } from '../../agents/antigravity/log.js';
import { listAgentProcesses } from '../../agents/listing.js';
import type { MesaContext } from '../../context.js';
import { readBranchDiff } from '../../git/branch-diff.js';
import { MesaError } from '../../lib/result.js';
import { joinWarnings, type Recorded } from '../../receipts/recorder.js';
import { recordedBase } from '../../worktrees/base.js';
import type { SessionScope } from '../board/board.js';
import { sessionTree } from '../board/tree.js';
import { autoName } from '../native/auto-name.js';
import { decisionStatus } from '../native/decision-status.js';
import { discoverNative } from '../native/discovery.js';
import { nativeHistory } from '../native/history.js';
import { instructionStatus } from '../native/instructions.js';
import { searchConversations } from '../native/search.js';
import { vaultStatus } from '../native/vault-status.js';
import { applyEach } from '../record/each.js';
import { renameSession, setWorkflowStatus } from '../record/edits.js';
import { sessionFolder } from '../record/folder.js';
import { projectScope } from '../record/general.js';
import { recordAgent, type SessionRecord } from '../record/record.js';
import { markRead, markUnread } from '../record/unread.js';
import { readHookEvents } from '../signals/hook-events.js';
import { refreshReadings } from '../signals/readings.js';
import { sessionGoal } from '../start/goal.js';
import { sessionLog } from '../window/output-log.js';
import type { continueActions } from './continue.js';
import type { SessionDeps } from './deps.js';
import type { lifecycleActions } from './lifecycle.js';

/**
 * The board's side of sessions: what it lists, shows, and finds of them, natively too, and what
 * it shows them by (a name, a workflow status, whether they are unread, and whether they are
 * archived).
 */
export function inspectActions(
  ctx: MesaContext,
  deps: SessionDeps,
  /** The lifecycle's stop: archiving a live session ends it. */
  stop: ReturnType<typeof lifecycleActions>['stop'],
  /** The continue actions' resume: an unarchive with `resume` reopens the conversation. */
  resume: ReturnType<typeof continueActions>['resume'],
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
  /** Clears a session's `archivedAt` without restarting it, with its session receipt. */
  const clearArchived = (id: string) => {
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
  };
  return {
    list: board,
    /** The board as a tree: children under their parent, each row with its depth. */
    tree: async (scope: SessionScope = 'board') => sessionTree(await board(scope)),
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
     * One session's record, its context use read now, with `alive` and who placed its state
     * (`supervision`) as the board reads them, whether its instruction hook and its mesa-vault
     * mount are configured, and its decision tool and automatic advice, configured or why not,
     * with when each was last seen; not_found for an unknown id.
     */
    show: async (id: string) => {
      store.get(id);
      const row = (await board('all')).find((r) => r.id === id);
      // The look may have learned a provider-owned ID before its context can be read.
      refreshReadings(contextDeps, store.get(id));
      // Read again: the look may have saved a new state, or started it from its queue.
      const current = store.get(id);
      const latestAntigravityId =
        current.agent === 'antigravity'
          ? antigravitySessionId({ logs: paths.logs }, current, new Set(), true)
          : undefined;
      const identityEvents = readHookEvents(paths.events, id);
      const identityChanged =
        identityEvents.some((event) => event.event === 'SessionIdentityChanged') ||
        Boolean(
          current.agentSessionId &&
            latestAntigravityId &&
            latestAntigravityId !== current.agentSessionId,
        ) ||
        (identityEvents.some((event) => event.event === 'SessionIdentityAmbiguous')
          ? ('ambiguous' as const)
          : false);
      return {
        ...current,
        alive: row?.alive ?? false,
        supervision: row?.managed ? row.supervision : { source: 'rules' as const },
        instructions: instructionStatus(
          current.agent,
          ctx.home,
          ctx.env,
          ctx.self,
          identityChanged,
        ),
        vault: vaultStatus(current, ctx.home, ctx.self),
        decisions: decisionStatus(
          current,
          deps.assistance.assistState(current),
          ctx,
          identityChanged,
        ),
      };
    },
    /**
     * Everything the session's checkout holds that `base` lacks (readBranchDiff), read where its
     * agent works now (refreshReadings). Without `base`, its worktree's recorded base when it works
     * there (recordedBase), else the project's default.
     */
    diff: async (id: string, base?: string) => {
      const found = refreshReadings(contextDeps, store.get(id));
      const project = projectScope(found.project);
      if (!project)
        throw new MesaError('usage', 'a General session has no project checkout to diff');
      const { worktree } = found;
      const folder = sessionFolder(found);
      return readBranchDiff(
        ctx.open(),
        ctx.run,
        project,
        base ??
          (worktree && worktree.path === folder
            ? await recordedBase(ctx.run, worktree)
            : undefined),
        folder,
      );
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
    /**
     * Names a session no one has named from what the person asked it (autoName); unchanged, and
     * unrecorded, when it has a name or nothing to name it from yet.
     */
    autoName: (id: string) => {
      const before = store.get(id);
      return record(
        {
          type: 'session',
          summary: (r) => `Named session ${id} ${r.agentName}`,
          failure: `Could not name session ${id}`,
          project: (r) => projectScope(r.project),
          session: () => id,
          inputs: { id },
          outputs: (r) => ({ agentName: r.agentName }),
          changed: (r) => r.agentName !== before.agentName,
        },
        () => autoName({ ...ctx, store }, id),
      );
    },
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
    /**
     * Marks sessions read, as a person has them open (CONTEXT.md, Unread); an unknown id refuses
     * them all. Unrecorded: the app marks the session it shows, many times a day.
     */
    read: (ids: readonly string[]) => markRead(store, ids, ctx.clock().toISOString()),
    /** Marks sessions unread, to come back to; as `read` does. */
    unread: (ids: readonly string[]) => markUnread(store, ids),
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
    /**
     * Clears a session's `archivedAt`, and with `resume` reopens its conversation as a new session
     * (`resumed`, the continue actions' resume, with its own receipt), so it is live again in its
     * project. One that cannot resume (a plain terminal, no conversation, a folder gone) stays
     * unarchived, ended, with a warning saying why.
     */
    unarchive: async (
      id: string,
      { resume: reopen = false } = {},
    ): Promise<Recorded<SessionRecord & { resumed?: SessionRecord }>> => {
      const unarchived = clearArchived(id);
      if (!reopen) return unarchived;
      try {
        const resumed = await resume(id);
        return {
          ...unarchived,
          result: { ...unarchived.result, resumed: resumed.result.record },
          warning: joinWarnings(unarchived.warning, resumed.warning),
        };
      } catch (error) {
        if (!(error instanceof MesaError)) throw error;
        const why = `unarchived, not resumed: ${error.message}`;
        return { ...unarchived, warning: joinWarnings(unarchived.warning, why) };
      }
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
