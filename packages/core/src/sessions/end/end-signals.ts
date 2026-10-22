import { AGENTS } from '../../agents/agents.js';
import { antigravitySessionId } from '../../agents/antigravity/log.js';
import { promptContext } from '../../agents/hooks.js';
import type { MesaContext } from '../../context.js';
import { toFail } from '../../lib/result.js';
import { readRegistry } from '../../projects/registry.js';
import { joinWarnings } from '../../receipts/recorder.js';
import type { SessionScope } from '../board/board.js';
import type { SessionRow } from '../board/rows.js';
import { decisionStatus, decisionsReach } from '../native/decision-status.js';
import { mesaPointer } from '../native/instructions.js';
import { sessionFolder } from '../record/folder.js';
import { isOver } from '../record/lifecycle.js';
import { recordAgent, type SessionRecord } from '../record/record.js';
import { markEnded, markExited, startedOutputs } from '../record/session-receipt.js';
import { endRun } from '../run/end.js';
import type { SessionAssistance } from '../service/deps.js';
import { type HookEvent, parentHook, recordHookEvent } from '../signals/hook-events.js';
import { refreshReadings } from '../signals/readings.js';
import { dueToStart, startQueued } from '../start/queue.js';
import { callerOf, windowId } from '../window/caller.js';
import { recordPaneDied } from './pane-died.js';
import type { StopOutcome } from './stop.js';

// The signals that a session ended, and what follows from each: an agent hook's payload, a tmux
// hook's event, a stop, or a look at the board. Each starts what was queued after the session
// (CONTEXT.md, Queued session), with its receipt; a look starts what a missed signal left
// waiting. No daemon. No end starts a Vault capture: a turn's end (the agent's Stop hook) does,
// throttled, so archiving or removing a session never waits on one (#844).
// An agent hook may also answer its agent: the pointer at its start, and decision advice with a
// prompt (ADR-0019, #463), only for the native conversation Mesa holds.

/** One profile's signals that a session ended, and the queue trigger they share, for the sessions service. */
export function endSignals(
  ctx: MesaContext,
  deps: {
    /** The board as it is now (listSessions), in a scope. */
    look: (scope?: SessionScope) => Promise<SessionRow[]>;
    /** What a queued start needs (startQueued). */
    launch: () => Parameters<typeof startQueued>[0];
    /** Where a session's context use is read (refreshReadings). */
    context: Parameters<typeof refreshReadings>[0];
    /** A turn's decision advice, and what a session's decision status reads. */
    assistance: SessionAssistance;
    /** Starts a session's Vault capture at a turn's end, when due (startCapture). */
    capture: (id: string) => Promise<string | undefined>;
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
  /**
   * The live record whose own native conversation sent `event`: never a subagent's, another
   * agent's, a nested or moved conversation's, or an ended record's (ADR-0010's native-ID check).
   */
  const owner = (event: HookEvent | undefined) => {
    const id = event?.mesaSessionId;
    if (!event || !id || !parentHook(event)) return undefined;
    const started = store.find(id);
    return started &&
      started.agent === event.agent &&
      !started.endedAt &&
      event.agentSessionId &&
      started.agentSessionId === event.agentSessionId
      ? started
      : undefined;
  };
  /** Where a session's agent runs, from its record and the registry. */
  const cwdOf = (started: SessionRecord) =>
    sessionFolder(started) ??
    readRegistry(paths.registry).find((entry) => entry.name === started.project)?.path;
  /** How the session's agent reaches the Decision model now, for its pointer to name. */
  const reach = (started: SessionRecord) => {
    try {
      return decisionsReach(
        decisionStatus(started, deps.assistance.assistState(started), ctx).tool,
      );
    } catch {
      return undefined;
    }
  };
  /** Which capability lines a session's pointer carries. */
  const pointerLines = (started: SessionRecord) => ({
    decisions: reach(started),
    // A config that does not read means no line, never a failed hook.
    guidelines: ctx.configIfAny()?.sessions.guidelines ?? false,
  });
  /** The advice for a turn, or none; a failure of any kind is none, never the hook's. */
  const advise = (...args: Parameters<SessionAssistance['advise']>) =>
    deps.assistance.advise(...args).catch(() => undefined);
  /** The shared receipt completion for a process exit, however it was detected. */
  const finishExit = (exited: SessionRecord) =>
    exited.kind === 'run' ? endRun(ctx, exited) : markExited(ctx, exited);
  return {
    /**
     * A stop's signal: a stopped session is over, so what was queued after it starts, however it
     * ended; a queued session cancelled hands its queue on instead (cancelQueued), so nothing
     * starts.
     */
    stopped: async (id: string, outcome: StopOutcome) =>
      outcome === 'cancelled' ? undefined : startAfter(id),
    /**
     * The board, once it has started what it found due: a queued session whose session is over
     * by this look, which a missed signal left waiting, and the exit of a session it found, a
     * Claude background one's too.
     */
    board: async (scope: SessionScope = 'board') => {
      const rows = await deps.look(scope);
      let finishedRun = false;
      let recordedExit = false;
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
        const found = await recordPaneDied(
          { store, tmux, clock },
          row.tmux.session,
          row.tmux.window,
          'tmux',
        );
        recordedExit ||= Boolean(found);
        const exited = found ?? store.find(row.id);
        // The signal may have saved the exit but missed its receipt (or beaten its creation).
        if (!exited || exited.endedAt || !exited.events.some((e) => e.type === 'exited')) continue;
        await finishExit(exited);
        finishedRun ||= exited.kind === 'run';
      }
      const overNow = (id: string) => {
        const row = rows.find((r) => r.id === id);
        return row?.managed ? isOver(row) : overOrGone(id);
      };
      // An exit recorded here is not on the rows read before it: look again, so callers see it.
      return (await startQueue(overNow)).started || finishedRun || recordedExit
        ? deps.look(scope)
        : rows;
    },
    /**
     * One agent hook's payload, from `mesa hook claude` inside a Mesa session. A Stop, a turn's
     * end, reads the session's context use and starts its Vault capture when one is due
     * (startCapture: with none due, no transcript is read); a SessionEnd (not a /clear or a
     * /resume, which keep the agent running) starts what was queued after it. A SessionStart answers with the pointer, and a
     * UserPromptSubmit with the prompt's decision advice as `additionalContext`, when there is
     * any within Mesa's deadline (DecisionAssistance.advise).
     */
    hookEvent: async (agent: string, payload: string) => {
      const event = recordHookEvent(
        { store, eventsDir: paths.events, clock, home, secrets: ctx.secretsOrRefuse },
        { agent, mesaSessionId: windowId(env), payload },
      );
      const id = event?.mesaSessionId;
      // A turn ended: its reply's usage is in the transcript. A hook still logs without a record.
      const ended = event?.event === 'Stop' && id && parentHook(event) ? store.find(id) : undefined;
      if (ended) refreshReadings(deps.context, ended);
      // Only the conversation Mesa holds is captured: never a subagent's or a nested one's.
      const turned = event?.event === 'Stop' ? owner(event) : undefined;
      if (turned) await deps.capture(turned.id);
      const state =
        event && parentHook(event) && AGENTS[event.agent].hookState?.(event.event, event.payload);
      if (event?.event === 'SessionEnd' && id && state) await startAfter(id);
      if (event?.event === 'UserPromptSubmit') {
        const asking = owner(event);
        const advice = asking && (await advise(asking, promptOf(payload)));
        return advice ? { ...event, advice: promptContext(advice) } : event;
      }
      const started = event?.event === 'SessionStart' ? owner(event) : undefined;
      const cwd = started && cwdOf(started);
      return started && cwd
        ? {
            ...event,
            instruction: mesaPointer(started, ctx.profile, cwd, pointerLines(started)),
          }
        : event;
    },
    /**
     * Transient Antigravity instruction, only for the native conversation owned by this window:
     * the pointer, then the saved goal's ready advice, if any. Its hook runs before every model
     * call and carries no prompt, so it never asks a model, and re-sends the same words on every
     * invocation of a turn (docs/spikes/decision-assistance-feasibility.md).
     */
    antigravityInstruction: async (payload: string) => {
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
      const cwd = cwdOf(started);
      if (!cwd) return undefined;
      const held = started.agentSessionId
        ? started
        : store.update(started.id, (current) =>
            current.agentSessionId || current.endedAt ? {} : { agentSessionId: ownedId },
          );
      if (held.endedAt || held.agentSessionId !== ownedId) return undefined;
      const pointer = mesaPointer(held, ctx.profile, cwd, pointerLines(held));
      const advice = await advise(held, undefined, { readyOnly: true });
      return advice ? `${pointer}\n${advice}` : pointer;
    },
    /**
     * A tmux hook's event (`mesa hook tmux <event> <project> <window>`): `pane-died` records the
     * exit of the agent in a Mesa window, ends it when it is a skill run (endRun, as its
     * `mesa run` would, which may be gone), finishes its receipt, and starts what was queued
     * after it. An interactive receipt ends through markExited, without stopping its record; any
     * other event, or a window no session has, is not Mesa's and records nothing (undefined).
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

/** The prompt a UserPromptSubmit payload carries (Claude Code and Codex name it `prompt`). */
function promptOf(payload: string): string | undefined {
  try {
    const prompt: unknown = JSON.parse(payload)?.prompt;
    return typeof prompt === 'string' ? prompt : undefined;
  } catch {
    return undefined;
  }
}
