import type { FaroProfile } from '../../decisions/decide.js';
import type { Backend, DecisionRecorder } from '../../decisions/types.js';
import type { Clock } from '../../lib/clock.js';
import { MesaError } from '../../lib/result.js';
import type { RegistryEntry } from '../../projects/registry.js';
import type { AgentProcess } from '../agent-listing.js';
import type { HookEvent } from '../hook-events.js';
import { FINAL_STATES, isAgentState, type SessionRecord } from '../record.js';
import {
  classifySession,
  hookState,
  lastOutputLine,
  type Placement,
  type SessionSignals,
} from '../state.js';
import type { SessionStore } from '../store.js';
import type { TmuxBackend } from '../tmux/backend.js';
import { targetLabel } from '../tmux/format.js';
import { windowOf } from '../window-name.js';
import { foreignRow } from './foreign.js';
import { matchListed } from './match.js';
import { type ManagedRow, type SessionRow, secondsBetween } from './rows.js';

// ponytail: a fixed day; a config field if someone wants stopped sessions to linger longer.
/** How long a stopped session stays on the board, so it can be seen and resumed. */
const RECENT_MS = 24 * 60 * 60 * 1000;

/**
 * Saves a look's new state onto the record as it is now: a session a stop ended since keeps the
 * stop's. A record another process holds locked (busy, or a lock left by a killed mesa) is not
 * waited for or written: this look still shows the new state, and the next one tries again.
 */
function saveState(
  store: SessionStore,
  found: SessionRecord,
  lastState: SessionRecord['lastState'],
): SessionRecord {
  try {
    return store.update(found.id, (current) => (current.endedAt ? {} : { lastState }), {
      wait: false,
    });
  } catch (error) {
    // Locked, or removed meanwhile (an open whose window failed): shown, not saved.
    if (error instanceof MesaError && (error.code === 'locked' || error.code === 'not_found')) {
      return { ...found, lastState };
    }
    throw error;
  }
}

/** Whole seconds from `from` (ISO) to `until` (epoch ms), never negative. */

/**
 * The profile's sessions merged with live tmux and the agent listing: those not stopped, or
 * stopped within a day, or every one with `all`, then the listed sessions none of them runs, as
 * foreign rows (sessions of this home's other profiles are left out). A listed process is the
 * session whose window it runs in (its pid is the pane's), else the newest session not stopped
 * that holds its agent session id. Faro classifies every row from its latest hook event, its
 * listing, its window, and (only when neither of the first two speaks) its tail; a new state is
 * saved to the record; a queued session, and one cancelled before it ran, keeps Mesa's state, at
 * no attention. Highest attention first.
 */
export async function listSessions(
  deps: {
    store: SessionStore;
    tmux: Pick<TmuxBackend, 'setPaneDiedHook' | 'listWindows' | 'capturePane'>;
    listing: () => Promise<AgentProcess[]>;
    /** The session's hook events, oldest first. */
    events: (id: string) => HookEvent[];
    /** A project's priority from its mesa.yaml (0.5 when unknown). */
    priorityOf: (project: string | null) => number;
    faro: FaroProfile;
    /** Where each row's Decision goes; receipts implement it in P3. */
    recorder?: DecisionRecorder;
    /** Faro's shared backends (the adapter), asked when the state rules are unsure. */
    backends?: readonly Backend<SessionSignals>[];
    projects: readonly RegistryEntry[];
    /** Agent session ids that other profiles' records hold: not foreign, not this board's. */
    elsewhere: () => ReadonlySet<string>;
    clock: Clock;
  },
  { all = false } = {},
): Promise<SessionRow[]> {
  const now = deps.clock();
  const recent = (r: SessionRecord) =>
    !r.endedAt || now.getTime() - Date.parse(r.endedAt) < RECENT_MS;
  // Oldest first (the store's order), so `children` is too.
  const every = deps.store.list();
  const records = every.filter((r) => all || recent(r));
  const children = new Map<string, string[]>();
  for (const r of every) {
    if (!r.parent) continue;
    if (children.has(r.parent)) children.get(r.parent)?.push(r.id);
    else children.set(r.parent, [r.id]);
  }
  // One tmux look and one listing for the whole board, side by side, rather than one per record.
  // The look sets the pane-died hook first, so a server an older mesa started gets it; it never
  // starts a server. ponytail: two tmux calls in a row per look (about 8 ms); chain the hook into
  // list-windows if looks ever need to be faster.
  // Any record at all, on the board or not, so a stale hook heals even when only old sessions are left.
  const windowsNow = async () => {
    if (every.length) await deps.tmux.setPaneDiedHook();
    return records.length ? deps.tmux.listWindows() : [];
  };
  const [listed, windowList] = await Promise.all([deps.listing(), windowsNow()]);
  const { runs, listedAs: listedFor } = matchListed(records, windowList, listed);
  const byLabel = new Map(windowList.map((w) => [targetLabel(w), w]));
  const faro = {
    profile: deps.faro,
    clock: deps.clock,
    recorder: deps.recorder,
    backends: deps.backends,
  };
  const managed = await Promise.all(
    records.map(async (found): Promise<ManagedRow> => {
      const listedAs = listedFor(found.id);
      const window = byLabel.get(targetLabel(windowOf(found)));
      // A stopped session keeps its state, so its hook log is not read.
      const event = found.endedAt
        ? undefined
        : deps
            .events(found.id)
            .filter((e) => hookState(e.event, e.payload))
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
      const lastOutput = tail === undefined ? undefined : lastOutputLine(tail);
      // Queued, or cancelled before it ran: Mesa's own state, with no agent for Faro to read.
      const ran = isAgentState(found.lastState.state);
      const classified: Placement = ran
        ? await classifySession(faro, signals)
        : { lastState: found.lastState, attention: 0 };
      const { state, source, basis } = found.lastState;
      const next = classified.lastState;
      const changed = next.state !== state || next.source !== source || next.basis !== basis;
      const record = changed ? saveState(deps.store, found, classified.lastState) : found;
      // An ended session stops the clock when it ended, or when it was seen to; one that never
      // ran has none.
      const end =
        record.endedAt ??
        (FINAL_STATES.has(classified.lastState.state) ? classified.lastState.at : undefined);
      return {
        ...record,
        ...classified,
        managed: true,
        children: children.get(record.id) ?? [],
        alive: window !== undefined || listedAs !== undefined,
        runningSeconds: ran
          ? secondsBetween(record.startedAt, end ? Date.parse(end) : now.getTime())
          : 0,
        ...(listedAs ? { agentStatus: listedAs.status } : {}),
        ...(lastOutput ? { lastOutput } : {}),
      };
    }),
  );
  const elsewhere = deps.elsewhere();
  const foreign = listed
    .filter((p) => !runs(p) && !elsewhere.has(p.agentSessionId))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((process) => foreignRow({ ...deps, faro }, process, now));
  const rows: SessionRow[] = [...managed, ...(await Promise.all(foreign))];
  return rows.sort((a, b) => b.attention - a.attention || a.startedAt.localeCompare(b.startedAt));
}
