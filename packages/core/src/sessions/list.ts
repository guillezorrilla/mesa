import { basename } from 'node:path';
import type { Clock } from '../clock.js';
import type { FaroProfile } from '../decisions/decide.js';
import {
  classifySession,
  hookState,
  type Placement,
  type SessionSignals,
} from '../decisions/session-state.js';
import type { Backend, DecisionRecorder } from '../decisions/types.js';
import type { RegistryEntry } from '../registry.js';
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
 * (`decision` holds the probabilities), whether it is alive (its tmux window exists, a pane
 * whose agent exited still does, or the agent listing names it), and how long it has run.
 */
export type ManagedRow = SessionRecord &
  Placement & {
    managed: true;
    alive: boolean;
    runningSeconds: number;
    /** The agent listing's status (`idle`, `busy`, `waiting`), while it lists the session. */
    agentStatus?: string;
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
const projectOf = (cwd: string, projects: readonly RegistryEntry[]) => {
  const inside = projects
    .filter((p) => cwd === p.path || cwd.startsWith(`${p.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return (inside ?? projects.find((p) => p.name === basename(cwd)))?.name ?? null;
};

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
    tmux: Pick<TmuxBackend, 'listWindows' | 'capturePane'>;
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
  const records = deps.store.list().filter((r) => all || recent(r));
  // One tmux call and one listing for the whole board, side by side, rather than one per record.
  const [listed, windowList] = await Promise.all([
    deps.listing(),
    records.length ? deps.tmux.listWindows() : [],
  ]);
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
      // The tail is the last resort (ADR-0003): read only when no hook or listing speaks.
      if (!event && !listedAs && window && !window.dead && !found.endedAt) {
        signals.tail = await deps.tmux.capturePane(windowOf(found), 30).catch(() => undefined);
      }
      const classified = await classifySession(faro, signals);
      const { state, source, basis } = found.lastState;
      const next = classified.lastState;
      const changed = next.state !== state || next.source !== source || next.basis !== basis;
      const record = changed
        ? deps.store.update(found.id, { lastState: classified.lastState })
        : found;
      // An ended session stops the clock when it ended, or when it was seen to.
      const end =
        record.endedAt ??
        (FINAL_STATES.has(classified.lastState.state) ? classified.lastState.at : undefined);
      return {
        ...record,
        ...classified,
        managed: true,
        alive: window !== undefined || listedAs !== undefined,
        runningSeconds: secondsBetween(record.startedAt, end ? Date.parse(end) : now.getTime()),
        ...(listedAs ? { agentStatus: listedAs.status } : {}),
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
