import { basename } from 'node:path';
import type { FaroProfile } from '../decisions/decide.js';
import {
  classifySession,
  hookState,
  lastOutputLine,
  type Placement,
  type SessionSignals,
} from '../decisions/session-state.js';
import type { Backend, DecisionRecorder } from '../decisions/types.js';
import type { Clock } from '../lib/clock.js';
import { MesaError } from '../lib/result.js';
import type { RegistryEntry } from '../projects/registry.js';
import { type AgentProcess, listedState } from './agent-listing.js';
import type { HookEvent } from './events.js';
import {
  FINAL_STATES,
  foreignId,
  type SessionRecord,
  type SessionStore,
  windowOf,
} from './store.js';
import { type TmuxBackend, targetLabel } from './tmux.js';

/**
 * One board row for a Mesa session: the record with the state and attention Faro gives it now
 * (`decision` holds the probabilities), `lastOutput` as its pane's last line now (read on each look,
 * not saved; the record's own field is not written yet), whether it is alive (its tmux window exists, a pane
 * whose agent exited still does, or the agent listing names it), and how long it has run.
 */
export type ManagedRow = SessionRecord &
  Placement & {
    managed: true;
    alive: boolean;
    runningSeconds: number;
    /** The agent listing's status (`idle`, `busy`, `waiting`), while it lists the session. */
    agentStatus?: string;
    /** The ids of the sessions whose `parent` it is, oldest first, listed or not. */
    children: string[];
  };

/**
 * A live agent session Mesa did not start, read-only: shown on the board, never acted on
 * (ADR-0003). `project` is the registered project it runs in, if any; Faro reads its state from
 * the listing alone.
 */
export type ForeignRow = Omit<AgentProcess, 'status' | 'waitingFor'> &
  Placement & {
    id: ReturnType<typeof foreignId>;
    managed: false;
    project: string | null;
    alive: true;
    agentStatus: string;
    runningSeconds: number;
  };

export type SessionRow = ManagedRow | ForeignRow;

// ponytail: a fixed day; a config field if someone wants stopped sessions to linger longer.
/** How long a stopped session stays on the board, so it can be seen and resumed. */
const RECENT_MS = 24 * 60 * 60 * 1000;

/** The registered project `cwd` is in (the innermost), else the one named like its folder. */
export const projectOf = (cwd: string, projects: readonly RegistryEntry[]) => {
  const inside = projects
    .filter((p) => cwd === p.path || cwd.startsWith(`${p.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return (inside ?? projects.find((p) => p.name === basename(cwd)))?.name ?? null;
};

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
const secondsBetween = (from: string, until: number) =>
  Math.max(0, Math.round((until - Date.parse(from)) / 1000));

/**
 * The profile's sessions merged with live tmux and the agent listing: those not stopped, or
 * stopped within a day, or every one with `all`, then the listed sessions none of them runs, as
 * foreign rows (sessions of this home's other profiles are left out). A listed process is the
 * session whose window it runs in (its pid is the pane's), else the newest session not stopped
 * that holds its agent session id. Faro classifies every row from its latest hook event, its
 * listing, its window, and (only when neither of the first two speaks) its tail; a new state is
 * saved to the record. Highest attention first.
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
  // A stopped session runs nowhere, so only open ones can be a listed process. By pid first: a
  // /clear gives the agent a new session id in the same window. A resumed conversation keeps
  // its id, so the newest open record holding it wins.
  const open = records.filter((r) => !r.endedAt);
  const byWindow = new Map(open.map((r) => [targetLabel(windowOf(r)), r.id]));
  const byPane = new Map(windowList.map((w) => [w.panePid, byWindow.get(targetLabel(w))]));
  const byAgentSession = new Map(
    open.flatMap((r) => (r.agentSessionId ? [[r.agentSessionId, r.id] as const] : [])),
  );
  const runs = (p: AgentProcess) => byPane.get(p.pid) ?? byAgentSession.get(p.agentSessionId);
  const byRecord = new Map(
    listed.flatMap((p) => {
      const id = runs(p);
      return id ? [[id, p] as const] : [];
    }),
  );
  const byLabel = new Map(windowList.map((w) => [targetLabel(w), w]));
  const faro = {
    profile: deps.faro,
    clock: deps.clock,
    recorder: deps.recorder,
    backends: deps.backends,
  };
  const managed = await Promise.all(
    records.map(async (found): Promise<ManagedRow> => {
      const listedAs = byRecord.get(found.id);
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
      const classified = await classifySession(faro, signals);
      const { state, source, basis } = found.lastState;
      const next = classified.lastState;
      const changed = next.state !== state || next.source !== source || next.basis !== basis;
      const record = changed ? saveState(deps.store, found, classified.lastState) : found;
      // An ended session stops the clock when it ended, or when it was seen to.
      const end =
        record.endedAt ??
        (FINAL_STATES.has(classified.lastState.state) ? classified.lastState.at : undefined);
      return {
        ...record,
        ...classified,
        managed: true,
        children: children.get(record.id) ?? [],
        alive: window !== undefined || listedAs !== undefined,
        runningSeconds: secondsBetween(record.startedAt, end ? Date.parse(end) : now.getTime()),
        ...(listedAs ? { agentStatus: listedAs.status } : {}),
        ...(lastOutput ? { lastOutput } : {}),
      };
    }),
  );
  const elsewhere = deps.elsewhere();
  const foreign = listed
    .filter((p) => !runs(p) && !elsewhere.has(p.agentSessionId))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map(async (process): Promise<ForeignRow> => {
      const { status, waitingFor: _, ...p } = process;
      const project = projectOf(p.cwd, deps.projects);
      // ponytail: no record, so each look starts its state now and a foreign wait never climbs;
      // keep a first-seen time per pid if foreign sessions need to rank by how long they wait.
      const last = { ...listedState(process), at: now.toISOString(), source: 'listing' as const };
      // ponytail: rules only; with no record to keep its basis, the adapter would be asked again
      // on every look. Give foreign sessions a basis cache if they need the adapter.
      const classified = await classifySession(
        { ...faro, backends: [] },
        {
          now: now.toISOString(),
          agent: p.agent,
          last,
          ended: false,
          listed: process,
          priority: deps.priorityOf(project),
        },
      );
      return {
        ...p,
        ...classified,
        id: foreignId(p.pid),
        managed: false,
        project,
        alive: true,
        agentStatus: status,
        runningSeconds: secondsBetween(p.startedAt, now.getTime()),
      };
    });
  const rows: SessionRow[] = [...managed, ...(await Promise.all(foreign))];
  return rows.sort((a, b) => b.attention - a.attention || a.startedAt.localeCompare(b.startedAt));
}

/** A board row placed in the session tree: `depth` 0 at the top, 1 for a child, and so on. */
export type TreeRow = SessionRow & { depth: number };

/**
 * The board as a tree: each row followed by its children, and theirs. Siblings, and the rows at
 * the top, rank by the highest attention in their subtree, so a child waiting on a person lifts
 * its whole branch (CONTEXT.md, Attention score); ties keep the board's order.
 *
 * A row's parent is the one it names, or the session that one was resumed as, the newest in a
 * chain of resumes, so a conversation's children stay together. A row whose parent is not on the
 * board (removed, or stopped too long ago) sits at the top, and so does a row in a loop of
 * hand-edited records.
 *
 * ponytail: resumes are followed through the board's own rows, so a chain whose middle session
 * has left the board stops there; pass the store's resume links in if that ever matters. And
 * placing recurses: a parent chain thousands deep would overflow the stack.
 */
export function sessionTree(rows: readonly SessionRow[]): TreeRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const resumedAs = new Map(
    rows.flatMap((r) => (r.managed && r.resumedFrom ? [[r.resumedFrom, r.id] as const] : [])),
  );
  const parentOf = (r: SessionRow): string | undefined => {
    let parent = r.managed ? r.parent : undefined;
    const seen = new Set<string>();
    while (parent && resumedAs.has(parent) && !seen.has(parent)) {
      seen.add(parent);
      parent = resumedAs.get(parent);
    }
    return parent && parent !== r.id && byId.has(parent) ? parent : undefined;
  };
  const kids = new Map<string, SessionRow[]>();
  const tops: SessionRow[] = [];
  for (const row of rows) {
    const parent = parentOf(row);
    if (!parent) tops.push(row);
    else if (kids.has(parent)) kids.get(parent)?.push(row);
    else kids.set(parent, [row]);
  }
  // The highest attention in each row's subtree, each subtree counted once.
  const peak = new Map<string, number>();
  const peakOf = (row: SessionRow): number => {
    const known = peak.get(row.id);
    if (known !== undefined) return known;
    peak.set(row.id, row.attention);
    const top = Math.max(row.attention, ...(kids.get(row.id) ?? []).map(peakOf));
    peak.set(row.id, top);
    return top;
  };
  const ranked = (group: readonly SessionRow[]) => [...group].sort((a, b) => peakOf(b) - peakOf(a));
  const out: TreeRow[] = [];
  const placed = new Set<string>();
  const place = (row: SessionRow, depth: number) => {
    if (placed.has(row.id)) return;
    placed.add(row.id);
    out.push({ ...row, depth });
    for (const child of ranked(kids.get(row.id) ?? [])) place(child, depth + 1);
  };
  for (const row of ranked(tops)) place(row, 0);
  // Rows in a loop have a parent on the board but no way down from the top: they go at the top.
  for (const row of rows) place(row, 0);
  return out;
}
