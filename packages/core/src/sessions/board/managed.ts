import { runnableAgent } from '../../agents/agents.js';
import { MesaError } from '../../lib/result.js';
import type { AgentProcess } from '../agent-listing.js';
import type { HookEvent } from '../hook-events.js';
import { FINAL_STATES, isAgentState, type SessionRecord } from '../record.js';
import { classifySession, type Placement, type SessionSignals } from '../state.js';
import type { SessionStore } from '../store.js';
import type { TmuxBackend } from '../tmux/backend.js';
import type { TmuxWindow } from '../tmux/format.js';
import { windowOf } from '../window-name.js';
import { type ManagedRow, secondsBetween } from './rows.js';

/**
 * Saves what a look learned onto the record as it is now: a new state, or the agent session id a
 * /clear moved it to. A session a stop ended since keeps the stop's. A record another process
 * holds locked (busy, or a lock left by a killed mesa) is not waited for or written: this look
 * still shows what it learned, and the next one tries again.
 */
function saveLook(
  store: SessionStore,
  found: SessionRecord,
  learned: Partial<Pick<SessionRecord, 'lastState' | 'agentSessionId'>>,
): SessionRecord {
  try {
    return store.update(found.id, (current) => (current.endedAt ? {} : learned), {
      wait: false,
    });
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
 * names for it, its children): Faro classifies it from its latest hook event, its listing, its
 * window, and (only when neither of the first two speaks) its tail, and a new state, or the agent
 * session id a /clear moved it to, is saved to the record. A queued session, and one cancelled
 * before it ran, keeps Mesa's state, at no attention.
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
  seen: { now: Date; window?: TmuxWindow; listedAs?: AgentProcess; children: string[] },
): Promise<ManagedRow> {
  const { now, window, listedAs } = seen;
  const reader = runnableAgent(found.agent);
  // A stopped session keeps its state, so its hook log is not read.
  const event = found.endedAt
    ? undefined
    : deps
        .events(found.id)
        .filter((e) => reader?.hookState(e.event, e.payload))
        .at(-1);
  const signals: SessionSignals = {
    now: now.toISOString(),
    agent: found.agent,
    last: found.lastState,
    ended: Boolean(found.endedAt),
    ...(event ? { event } : {}),
    ...(listedAs ? { listed: listedAs } : {}),
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
  if (tail !== undefined && !window?.dead && !event && !listedAs) signals.tail = tail;
  const lastOutput = tail === undefined ? undefined : reader?.screen.lastLine(tail);
  // Queued, or cancelled before it ran: Mesa's own state, with no agent for Faro to read.
  const ran = isAgentState(found.lastState.state);
  const classified: Placement = ran
    ? await classifySession(deps.faro, signals)
    : { lastState: found.lastState, attention: 0 };
  const { state, source, basis } = found.lastState;
  const next = classified.lastState;
  const changed = next.state !== state || next.source !== source || next.basis !== basis;
  // Listed by its pane's pid under another id: a /clear started a new conversation there.
  const moved = listedAs?.agentSessionId && listedAs.agentSessionId !== found.agentSessionId;
  const learned = {
    ...(changed ? { lastState: next } : {}),
    ...(moved ? { agentSessionId: listedAs.agentSessionId } : {}),
  };
  const record = changed || moved ? saveLook(deps.store, found, learned) : found;
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
    alive: window !== undefined || listedAs !== undefined,
    runningSeconds: ran
      ? secondsBetween(record.startedAt, end ? Date.parse(end) : now.getTime())
      : 0,
    ...(listedAs ? { agentStatus: listedAs.status } : {}),
    ...(lastOutput ? { lastOutput } : {}),
  };
}
