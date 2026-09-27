import { runnableAgent } from '../agents/agents.js';
import type { MesaContext } from '../context.js';
import { toFail } from '../lib/result.js';
import { joinWarnings } from '../receipts/recorder.js';
import type { SessionRow } from './board/rows.js';
import { windowId } from './caller.js';
import { refreshContext } from './context-use.js';
import { recordHookEvent } from './hook-events.js';
import { recordPaneDied } from './pane-died.js';
import { dueToStart, startQueued } from './queue.js';
import { isOver } from './record.js';
import { endRun } from './run.js';
import { markEnded, markExited, startedOutputs } from './session-receipt.js';
import type { StopOutcome } from './stop.js';

// The signals that a session ended, and what follows from each: an agent hook's payload, a tmux
// hook's event, a stop, or a look at the board. Each starts what was queued after the session
// (CONTEXT.md, Queued session), with its receipt; a look starts what a missed signal left
// waiting. No daemon.

/** One profile's signals that a session ended, and the queue trigger they share, for the sessions service. */
export function endSignals(
  ctx: MesaContext,
  deps: {
    /** The board as it is now (listSessions), ended sessions too with `all`. */
    look: (all?: boolean) => Promise<SessionRow[]>;
    /** What a queued start needs (startQueued). */
    launch: () => Parameters<typeof startQueued>[0];
    /** Where a session's context use is read (refreshContext). */
    context: Parameters<typeof refreshContext>[0];
  },
) {
  const { store, tmux, record, paths } = ctx;
  const { clock, env, home } = ctx.deps;
  /**
   * Starts, each with its session receipt, the queued sessions waiting on one `over` says is
   * over. A start that fails leaves its failure receipt and a warning, never a failed caller:
   * whether one started, and the warnings.
   */
  const startQueue = async (over: (id: string) => boolean) => {
    let started = false;
    const warnings: (string | undefined)[] = [];
    for (const queued of dueToStart(store, over, clock())) {
      try {
        const recorded = await record(
          {
            type: 'session',
            summary: (r) => `Started queued session ${queued.id} on ${r?.record.project}`,
            failure: `Could not start queued session ${queued.id}`,
            project: () => queued.project,
            session: () => queued.id,
            agent: () => queued.agent,
            inputs: { id: queued.id, after: queued.after },
            outputs: (r) => (r ? startedOutputs(r.record) : {}),
            changed: (r) => r !== undefined,
            warning: (r) => r?.warning,
          },
          () => startQueued(deps.launch(), queued.id),
        );
        started ||= Boolean(recorded.result);
        warnings.push(recorded.warning);
      } catch (error) {
        warnings.push(`queued session ${queued.id} did not start: ${toFail(error).error.message}`);
        // It ended failed: its opening receipt (Queued session) is marked ended too.
        const ended = store.find(queued.id);
        if (ended?.endedAt)
          warnings.push((await markEnded(ctx, { result: null, receipt: null }, ended)).warning);
      }
    }
    return { started, warning: joinWarnings(...warnings) };
  };
  /** Whether the session `id` is over for its queue: it is, or it is gone. */
  const overOrGone = (id: string) => {
    const found = store.find(id);
    return !found || isOver(found);
  };
  /** Starts what was queued after session `id`, which is over now. */
  const startAfter = (id: string) => startQueue((after) => after === id);
  return {
    /**
     * A stop's signal: a stopped session is over, so what was queued after it starts; a queued
     * session cancelled hands its queue on instead (cancelQueued), so nothing starts.
     */
    stopped: async (id: string, outcome: StopOutcome) =>
      outcome === 'cancelled' ? undefined : startAfter(id),
    /**
     * The board, once it has started what it found due: a queued session whose session is over
     * by this look, which a missed signal left waiting.
     */
    board: async (all = false) => {
      const rows = await deps.look(all);
      const overNow = (id: string) => {
        const row = rows.find((r) => r.id === id);
        return row?.managed ? isOver(row) : overOrGone(id);
      };
      return (await startQueue(overNow)).started ? deps.look(all) : rows;
    },
    /**
     * One agent hook's payload, from `mesa hook claude` inside a Mesa session. A Stop reads the
     * session's context use; a SessionEnd (not a /clear or a /resume, which keep the agent
     * running) starts what was queued after it.
     */
    hookEvent: async (agent: string, payload: string) => {
      const event = recordHookEvent(
        { store, eventsDir: paths.events, clock, home, secrets: ctx.secretsOrRefuse },
        { agent, mesaSessionId: windowId(env), payload },
      );
      const id = windowId(env);
      // A turn ended: its reply's usage is in the transcript. A hook still logs without a record.
      const ended = event?.event === 'Stop' && id ? store.find(id) : undefined;
      if (ended) refreshContext(deps.context, ended);
      const state = event && runnableAgent(event.agent)?.hookState(event.event, event.payload);
      if (event?.event === 'SessionEnd' && id && state) {
        await startAfter(id);
      }
      return event;
    },
    /**
     * A tmux hook's event (`mesa hook tmux <event> <project> <window>`): `pane-died` records the
     * exit of the agent in a Mesa window, ends it when it is a skill run (endRun, as its
     * `mesa run` would, which may be gone), starts what was queued after it, then puts its last
     * output into its receipt (markExited); any other event, or a window no session has, is not
     * Mesa's and records nothing (undefined).
     */
    tmuxEvent: async (event: string, project: string, window: string) => {
      if (event !== 'pane-died') return undefined;
      const exited = await recordPaneDied({ store, tmux, clock }, project, window);
      if (!exited) return undefined;
      if (exited.kind === 'run') {
        await endRun({ store, tmux, clock, runs: paths.runs, logs: paths.logs }, exited);
      }
      await startAfter(exited.id);
      await markExited(ctx, exited);
      return exited;
    },
  };
}
