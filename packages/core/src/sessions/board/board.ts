import type { FaroProfile } from '../../decisions/decide.js';
import type { Backend, DecisionRecorder } from '../../decisions/types.js';
import type { Clock } from '../../lib/clock.js';
import type { Env } from '../../lib/process.js';
import type { RegistryEntry } from '../../projects/registry.js';
import type { AgentProcess } from '../agent-listing.js';
import type { HookEvent } from '../hook-events.js';
import type { SessionRecord } from '../record.js';
import type { SessionSignals } from '../state.js';
import type { SessionStore } from '../store.js';
import type { TmuxBackend } from '../tmux/backend.js';
import { targetLabel } from '../tmux/format.js';
import { windowOf } from '../window-name.js';
import { ownSessionIds } from './agent-ids.js';
import { foreignRow } from './foreign.js';
import { managedRow } from './managed.js';
import { matchListed } from './match.js';
import type { SessionRow } from './rows.js';

// ponytail: a fixed day; a config field if someone wants stopped sessions to linger longer.
/** How long a stopped session stays on the board, so it can be seen and resumed. */
const RECENT_MS = 24 * 60 * 60 * 1000;

/**
 * The profile's sessions merged with live tmux and the agent listing: those not stopped, or
 * stopped within a day, or every one with `all`, then the listed sessions none of them runs, as
 * foreign rows (sessions of this home's other profiles are left out). A session whose agent picks
 * its own id (Codex) and has none yet gets the one its agent's files name (ownSessionIds) first.
 * A listed process is the session whose window it runs in (its pid is the pane's), else the
 * newest session not stopped that holds its agent session id. Faro classifies every row from its
 * latest hook event, its listing, its window, and (only when neither of the first two speaks) its
 * tail; a new state is saved to the record, and so is an id read now or the id the listing names
 * for its pane after a /clear. A queued session, and one cancelled before it ran, keeps Mesa's
 * state, at no attention. Highest attention first.
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
    /** Where an agent that picks its own session id keeps its files (Codex: `CODEX_HOME`). */
    env: Env;
    home: string;
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
  const elsewhere = deps.elsewhere();
  const held = new Set([...every.flatMap((r) => r.agentSessionId ?? []), ...elsewhere]);
  const read = ownSessionIds(deps, records, held);
  // Matched with the ids read now, so a session's own thread is never listed as foreign.
  const looked = records.map((r) => ({ ...r, agentSessionId: r.agentSessionId ?? read.get(r.id) }));
  const { runs, listedAs: listedFor } = matchListed(looked, windowList, listed);
  const byLabel = new Map(windowList.map((w) => [targetLabel(w), w]));
  const faro = {
    profile: deps.faro,
    clock: deps.clock,
    recorder: deps.recorder,
    backends: deps.backends,
  };
  const managed = await Promise.all(
    records.map((found) =>
      managedRow({ ...deps, faro }, found, {
        now,
        listedAs: listedFor(found.id),
        agentSessionId: read.get(found.id),
        window: byLabel.get(targetLabel(windowOf(found))),
        children: children.get(found.id) ?? [],
      }),
    ),
  );
  const foreign = listed
    .filter((p) => !runs(p) && !elsewhere.has(p.agentSessionId))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((process) => foreignRow({ ...deps, faro }, process, now));
  const rows: SessionRow[] = [...managed, ...(await Promise.all(foreign))];
  return rows.sort((a, b) => b.attention - a.attention || a.startedAt.localeCompare(b.startedAt));
}
