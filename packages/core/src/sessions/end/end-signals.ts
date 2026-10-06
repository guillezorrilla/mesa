import { AGENTS } from '../../agents/agents.js';
import { antigravitySessionId } from '../../agents/antigravity/log.js';
import type { MesaContext } from '../../context.js';
import { toFail } from '../../lib/result.js';
import { readRegistry } from '../../projects/registry.js';
import { joinWarnings } from '../../receipts/recorder.js';
import type { SessionRow } from '../board/rows.js';
import { mesaPointer } from '../native/instructions.js';
import { isOver, recordAgent, type SessionRecord } from '../record/record.js';
import { markEnded, markExited, startedOutputs } from '../record/session-receipt.js';
import { endRun } from '../run/end.js';
import { refreshContext } from '../signals/context-use.js';
import { parentHook, recordHookEvent } from '../signals/hook-events.js';
import { dueToStart, startQueued } from '../start/queue.js';
import { callerOf, windowId } from '../window/caller.js';
import { recordPaneDied } from './pane-died.js';
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
  const { clock, env, home } = ctx;
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
            // A start with dangerous launch flags or a sandbox override is kept (launchGuardrail).
            kind: 'guardrail',
            type: 'session',
            summary: (r) => `Started queued session ${queued.id} on ${r?.record.project}`,
            failure: `Could not start queued session ${queued.id}`,
            project: () => queued.project,
            session: () => queued.id,
            agent: () => recordAgent(queued),
            inputs: { id: queued.id, after: queued.after },
            outputs: (r) => (r ? startedOutputs(r.record, ctx.open().config.agents) : {}),
            changed: (r) => r !== undefined,
            warning: (r) => r?.warning,
          },
          () => startQueued(deps.launch(), queued.id, queued.after),
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
  /** The shared receipt completion for a process exit, however it was detected. */
  const finishExit = (exited: SessionRecord) =>
    exited.kind === 'run' ? endRun(ctx, exited) : markExited(ctx, exited);
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
      let finishedRun = false;
      for (const row of rows) {
        if (!row.managed || row.endedAt || !isOver(row)) continue;
        if (row.backgroundId) {
          if (row.nativeState !== 'stopped') continue;
          let newlyExited = false;
          const exited = store.update(row.id, (current) => {
            if (current.events.some((event) => event.type === 'exited')) return {};
            newlyExited = true;
            return { events: [...current.events, { type: 'exited', at: clock().toISOString() }] };
          });
          await markExited(ctx, exited);
          finishedRun ||= newlyExited;
          continue;
        }
        const exited =
          (await recordPaneDied(
            { store, tmux, clock },
            row.tmux.session,
            row.tmux.window,
            'tmux',
          )) ?? store.find(row.id);
        // The signal may have saved the exit but missed its receipt (or beaten its creation).
        if (!exited || exited.endedAt || !exited.events.some((e) => e.type === 'exited')) continue;
        await finishExit(exited);
        finishedRun ||= exited.kind === 'run';
      }
      const overNow = (id: string) => {
        const row = rows.find((r) => r.id === id);
        return row?.managed ? isOver(row) : overOrGone(id);
      };
      return (await startQueue(overNow)).started || finishedRun ? deps.look(all) : rows;
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
      const id = event?.mesaSessionId;
      // A turn ended: its reply's usage is in the transcript. A hook still logs without a record.
      const ended = event?.event === 'Stop' && id && parentHook(event) ? store.find(id) : undefined;
      if (ended) refreshContext(deps.context, ended);
      const state =
        event && parentHook(event) && AGENTS[event.agent].hookState?.(event.event, event.payload);
      if (event?.event === 'SessionEnd' && id && state) {
        await startAfter(id);
      }
      if (event?.event !== 'SessionStart' || !id || !parentHook(event)) return event;
      const started = store.find(id);
      if (
        !started ||
        started.agent !== event.agent ||
        started.endedAt ||
        !event.agentSessionId ||
        started.agentSessionId !== event.agentSessionId
      )
        return event;
      const project = readRegistry(paths.registry).find((entry) => entry.name === started.project);
      const cwd = started.cwd ?? started.worktree?.path ?? project?.path;
      return cwd ? { ...event, instruction: mesaPointer(started, ctx.profile, cwd) } : event;
    },
    /** Transient Antigravity instruction, only for the native conversation owned by this window. */
    antigravityInstruction: (payload: string) => {
      const started = callerOf({ store, env, profileName: ctx.profile }).session;
      if (started?.agent !== 'antigravity' || started.endedAt) return undefined;
      let conversationId: unknown;
      try {
        conversationId = JSON.parse(payload)?.conversationId;
      } catch {
        return undefined;
      }
      const ownedId =
        started.agentSessionId ?? antigravitySessionId({ logs: paths.logs }, started, new Set());
      if (!ownedId || conversationId !== ownedId) return undefined;
      const project = readRegistry(paths.registry).find((entry) => entry.name === started.project);
      const cwd = started.cwd ?? started.worktree?.path ?? project?.path;
      if (!cwd) return undefined;
      const owner = started.agentSessionId
        ? started
        : store.update(started.id, (current) =>
            current.agentSessionId || current.endedAt ? {} : { agentSessionId: ownedId },
          );
      return !owner.endedAt && owner.agentSessionId === ownedId
        ? mesaPointer(owner, ctx.profile, cwd)
        : undefined;
    },
    /**
     * A tmux hook's event (`mesa hook tmux <event> <project> <window>`): `pane-died` records the
     * exit of the agent in a Mesa window, ends it when it is a skill run (endRun, as its
     * `mesa run` would, which may be gone), finishes its receipt, and starts what was queued
     * after it. An interactive receipt ends through markExited, without stopping its record;
     * any other event, or a window no session has, is not Mesa's and records nothing (undefined).
     */
    tmuxEvent: async (event: string, project: string, window: string) => {
      if (event !== 'pane-died') return undefined;
      const exited = await recordPaneDied({ store, tmux, clock }, project, window);
      if (!exited) return undefined;
      await finishExit(exited);
      await startAfter(exited.id);
      return exited;
    },
  };
}
