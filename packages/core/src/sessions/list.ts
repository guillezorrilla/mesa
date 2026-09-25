import { basename } from 'node:path';
import type { Clock } from '../clock.js';
import type { RegistryEntry } from '../registry.js';
import { type AgentProcess, listedState } from './agent-listing.js';
import {
  FINAL_STATES,
  foreignId,
  type SessionRecord,
  type SessionStore,
  windowOf,
} from './store.js';
import { type TmuxBackend, targetLabel } from './tmux.js';

/**
 * One board row for a Mesa session: the record, whether it is alive (its tmux window exists, a
 * pane whose agent exited still does, or the agent listing names it), and how long it has run.
 */
export type ManagedRow = SessionRecord & {
  managed: true;
  alive: boolean;
  runningSeconds: number;
  /** The agent listing's status (`idle`, `busy`, `waiting`), while it lists the session. */
  agentStatus?: string;
};

/**
 * A live agent session Mesa did not start, read-only: shown on the board, never acted on
 * (ADR-0003). `project` is the registered project it runs in, if any; `lastState` is the
 * listing's own reading of it.
 */
export type ForeignRow = Omit<AgentProcess, 'status' | 'waitingFor'> & {
  id: ReturnType<typeof foreignId>;
  managed: false;
  project: string | null;
  alive: true;
  agentStatus: string;
  lastState: SessionRecord['lastState'];
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
 * that holds its agent session id. A session that has not ended but is not alive is marked
 * `done` from tmux, and that is saved.
 */
export async function listSessions(
  deps: {
    store: SessionStore;
    tmux: Pick<TmuxBackend, 'listWindows'>;
    listing: () => Promise<AgentProcess[]>;
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
  const windows = new Set(windowList.map(targetLabel));
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
  const managed = records.map((found): ManagedRow => {
    const listedAs = byRecord.get(found.id);
    const alive = windows.has(targetLabel(windowOf(found))) || listedAs !== undefined;
    const gone = !alive && !found.endedAt && !FINAL_STATES.has(found.lastState.state);
    const record = gone
      ? deps.store.update(found.id, {
          // ponytail: #18's rule, set here; Faro's rules backend (#25) takes state over. 0.85 as for
          // pane_dead (ADR-0003 amendment): the window being gone is a process fact.
          lastState: { state: 'done', confidence: 0.85, at: now.toISOString(), source: 'tmux' },
        })
      : found;
    // An ended session stops the clock when it ended, or when it was seen to.
    const end =
      record.endedAt ??
      (FINAL_STATES.has(record.lastState.state) ? record.lastState.at : undefined);
    return {
      ...record,
      managed: true,
      alive,
      runningSeconds: secondsBetween(record.startedAt, end ? Date.parse(end) : now.getTime()),
      ...(listedAs ? { agentStatus: listedAs.status } : {}),
    };
  });
  const elsewhere = deps.elsewhere();
  const foreign = listed
    .filter((p) => !runs(p) && !elsewhere.has(p.agentSessionId))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((process): ForeignRow => {
      const { status, waitingFor: _, ...p } = process;
      return {
        ...p,
        id: foreignId(p.pid),
        managed: false,
        project: projectOf(p.cwd, deps.projects),
        alive: true,
        agentStatus: status,
        lastState: { ...listedState(process), at: now.toISOString(), source: 'listing' },
        runningSeconds: secondsBetween(p.startedAt, now.getTime()),
      };
    });
  return [...managed, ...foreign];
}
