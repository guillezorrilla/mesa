import { isDeepStrictEqual } from 'node:util';
import { AGENTS } from '../../agents/agents.js';
import { MesaError } from '../../lib/result.js';
import type { AgentProcess } from '../agent-listing.js';
import { type HookEvent, parentHook } from '../hook-events.js';
import type { SessionRecord } from '../record.js';
import { classifySession, type Placement, type SessionSignals } from '../state.js';
import { FINAL_STATES, isAgentState } from '../states.js';
import type { SessionStore } from '../store.js';
import type { TmuxBackend } from '../tmux/backend.js';
import type { TmuxWindow } from '../tmux/format.js';
import { windowOf } from '../window-name.js';
import { type ManagedRow, secondsBetween } from './rows.js';

/**
 * Saves what a look learned onto the record as it is now: a new state, or an agent session id (the
 * one a /clear moved it to, or the one its agent picked). A stopped session keeps the stop's
 * state, and takes only an id it has none of, one its agent picked before the stop. A state
 * another look saved since this one read the record (the adapter's, beside a quick look) is newer
 * and stays. A record another process holds locked (busy, or a lock left by a killed mesa) is not
 * waited for or written: this look still shows what it learned, and the next one tries again.
 */
function saveLook(
  store: SessionStore,
  found: SessionRecord,
  learned: Partial<Pick<SessionRecord, 'lastState' | 'agentSessionId'>>,
): SessionRecord {
  try {
    const { agentSessionId: id } = learned;
    const stopped = (current: SessionRecord) =>
      id && !current.agentSessionId ? { agentSessionId: id } : {};
    const { lastState, ...rest } = learned;
    return store.update(
      found.id,
      (current) =>
        current.endedAt
          ? stopped(current)
          : isDeepStrictEqual(current.lastState, found.lastState)
            ? learned
            : rest,
      { wait: false },
    );
  } catch (error) {
    // Locked, or removed meanwhile (an open whose window failed): shown, not saved.
    if (error instanceof MesaError && (error.code === 'locked' || error.code === 'not_found')) {
      return { ...found, ...learned };
    }
    throw error;
  }
}

/**
 * A Mesa session's board row, from what one look saw of it (its window, the process the listing
 * names for it, the agent session id read for an agent that picks its own, its children): Faro
 * classifies it from its latest hook event, its listing, its window, and (only when neither of
 * the first two speaks) its tail, and a new state, or an agent session id (the one a /clear moved
 * it to, or the one read), is saved to the record. A listing row that gives no state (Codex's)
 * says nothing: not the state, and not that the session is alive. A queued session, and one
 * cancelled before it ran, keeps Mesa's state, at no attention.
 */
export async function managedRow(
  deps: {
    store: SessionStore;
    tmux: Pick<TmuxBackend, 'capturePane'>;
    /** The session's hook events, oldest first. */
    events: (id: string) => HookEvent[];
    /** A project's priority from its mesa.yaml (0.5 when unknown). */
    priorityOf: (project: string | null) => number;
    faro: Parameters<typeof classifySession>[0];
  },
  found: SessionRecord,
  seen: {
    now: Date;
    window?: TmuxWindow;
    listedAs?: AgentProcess;
    agentSessionId?: string;
    children: string[];
  },
): Promise<ManagedRow> {
  const { now, window, listedAs } = seen;
  if (found.agent === 'terminal') {
    const state = found.endedAt
      ? found.lastState.state
      : window && !window.dead
        ? 'working'
        : 'done';
    const lastState =
      state === found.lastState.state
        ? found.lastState
        : {
            state,
            confidence: 1,
            at: now.toISOString(),
            source: 'tmux' as const,
          };
    const record =
      lastState === found.lastState ? found : saveLook(deps.store, found, { lastState });
    const tail =
      window && !found.endedAt
        ? await deps.tmux.capturePane(windowOf(found), 30).catch(() => undefined)
        : undefined;
    return {
      ...record,
      lastState,
      attention: 0,
      managed: true,
      children: seen.children,
      alive: Boolean(window && !window.dead),
      runningSeconds: secondsBetween(
        record.startedAt,
        record.endedAt ? Date.parse(record.endedAt) : now.getTime(),
      ),
      ...(tail ? { lastOutput: tail.trimEnd().split('\n').at(-1) } : {}),
    };
  }
  const reader = AGENTS[found.agent];
  const listed = listedAs && reader.listing.state(listedAs) ? listedAs : undefined;
  // A stopped session keeps its state, so its hook log is not read.
  const event = found.endedAt
    ? undefined
    : deps
        .events(found.id)
        .filter((e) => parentHook(e) && reader.hookState?.(e.event, e.payload))
        .at(-1);
  const signals: SessionSignals = {
    now: now.toISOString(),
    agent: found.agent,
    background: found.background,
    last: found.lastState,
    ended: Boolean(found.endedAt),
    ...(event ? { event } : {}),
    ...(listed ? { listed } : {}),
    window: window
      ? {
          exists: true,
          dead: window.dead,
          deadStatus: window.deadStatus,
          deadSignal: window.deadSignal,
        }
      : { exists: false, dead: false },
    priority: deps.priorityOf(found.project),
  };
  // The pane's screen (a dead pane keeps its last one) is the board's last output. For state
  // it is the last resort (ADR-0003), passed on only for a live pane no hook or listing
  // speaks for.
  // ponytail: one capture-pane per window per look, side by side; batch them if boards grow
  // past a handful of sessions.
  const tail =
    window && !found.endedAt
      ? await deps.tmux.capturePane(windowOf(found), 30).catch(() => undefined)
      : undefined;
  if (tail !== undefined && !window?.dead && !event && !listed) signals.tail = tail;
  const lastOutput = tail === undefined ? undefined : reader.screen.lastLine(tail);
  // Queued, or cancelled before it ran: Mesa's own state, with no agent for Faro to read.
  const ran = isAgentState(found.lastState.state);
  const classified: Placement = ran
    ? await classifySession(deps.faro, signals)
    : { lastState: found.lastState, attention: 0 };
  const { state, source, basis } = found.lastState;
  const next = classified.lastState;
  const changed = next.state !== state || next.source !== source || next.basis !== basis;
  // Listed by its pane's pid under another id: a /clear started a new conversation there.
  const moved =
    listed && listed.agentSessionId !== found.agentSessionId ? listed.agentSessionId : undefined;
  // Else the one read for an agent that picks its own (Codex).
  const agentSessionId = moved ?? seen.agentSessionId;
  const learned = {
    ...(changed ? { lastState: next } : {}),
    ...(agentSessionId ? { agentSessionId } : {}),
  };
  const record = changed || agentSessionId ? saveLook(deps.store, found, learned) : found;
  // An ended session stops the clock when it ended, or when it was seen to; one that never
  // ran has none.
  const end =
    record.endedAt ??
    (FINAL_STATES.has(classified.lastState.state) ? classified.lastState.at : undefined);
  return {
    ...record,
    ...classified,
    managed: true,
    children: seen.children,
    alive: listed?.nativeState === 'stopped' ? false : window !== undefined || listed !== undefined,
    runningSeconds: ran
      ? secondsBetween(record.startedAt, end ? Date.parse(end) : now.getTime())
      : 0,
    ...(listed?.status === undefined ? {} : { agentStatus: listed.status }),
    ...(listed?.nativeState === undefined ? {} : { nativeState: listed.nativeState }),
    ...(lastOutput ? { lastOutput } : {}),
  };
}
