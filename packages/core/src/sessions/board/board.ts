import type { AgentProcess } from '../../agents/listing.js';
import type { FaroProfile } from '../../decisions/decide.js';
import type { DecisionRecorder } from '../../decisions/types.js';
import type { Clock } from '../../lib/clock.js';
import type { Env } from '../../lib/process.js';
import type { RegistryEntry } from '../../projects/registry.js';
import { takenOver, worktreeHolders } from '../record/holders.js';
import type { SessionRecord } from '../record/record.js';
import type { SessionStore } from '../record/store.js';
import type { HookEvent } from '../signals/hook-events.js';
import { refreshReadings } from '../signals/readings.js';
import type { TmuxBackend } from '../tmux/backend.js';
import { targetLabel } from '../tmux/format.js';
import { windowOf } from '../window/window-name.js';
import { ownSessionIds } from './agent-ids.js';
import { foreignRow } from './foreign.js';
import { managedRow } from './managed.js';
import { matchListed } from './match.js';
import type { SessionRow } from './rows.js';

// ponytail: a fixed day; a config field if someone wants stopped sessions to linger longer.
/** How long a stopped session stays on the board, so it can be seen and resumed. */
const RECENT_MS = 24 * 60 * 60 * 1000;

/**
 * Which sessions a look lists: the board's (those not archived, and not stopped more than a day
 * ago), every one (`all`), or only the archived ones (`archived`; CONTEXT.md, Archived session).
 */
export type SessionScope = 'board' | 'all' | 'archived';

/**
 * The profile's sessions in `scope` merged with live tmux and the agent listing: those not
 * archived and not stopped, or stopped within a day; every one with `all`; or only the archived
 * ones, newest archive first, with `archived`. Then, but for `archived`, the listed sessions none
 * of them runs, as foreign rows (sessions of this home's other profiles are left out). A session
 * whose agent picks its own id (Codex) and has none yet gets the one its agent's files name
 * (ownSessionIds) first.
 * A listed process is the session whose window it runs in (its pid is the pane's), else the
 * newest session not stopped that holds its agent session id. Faro classifies every row from its
 * latest hook event, its listing, its window, and (only when neither of the first two speaks) its
 * tail; a new state is saved to the record, and so is an id read now or the id the listing names
 * for its pane after a /clear. A live session's context use and branch are read (refreshReadings) when
 * its state changed. A queued session, and one cancelled before it ran, keeps
 * Mesa's state, at no attention. Highest attention first, but for `archived`.
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
    /** The model that may place unsure sessions beside this look, and its placements; none without one. */
    supervision?: Parameters<typeof managedRow>[0]['supervision'];
    /** Where each row's Decision goes; receipts implement it in P3. */
    recorder?: DecisionRecorder;
    projects: readonly RegistryEntry[];
    /** Agent session ids that other profiles' records hold: not foreign, not this board's. */
    elsewhere: () => ReadonlySet<string>;
    clock: Clock;
    /** Where an agent that picks its own session id keeps its files (Codex: `CODEX_HOME`). */
    env: Env;
    home: string;
    /** Per-window provider logs, when a provider exposes no public live ID event. */
    logs?: string;
  },
  { scope = 'board' }: { scope?: SessionScope } = {},
): Promise<SessionRow[]> {
  const now = deps.clock();
  const recent = (r: SessionRecord) =>
    !r.endedAt || now.getTime() - Date.parse(r.endedAt) < RECENT_MS;
  const inScope = (r: SessionRecord) =>
    scope === 'all' || (scope === 'archived' ? Boolean(r.archivedAt) : !r.archivedAt && recent(r));
  // Oldest first (the store's order), so `children` is too.
  const every = deps.store.readable();
  const records = every.filter(inScope);
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
  const faro = { profile: deps.faro, clock: deps.clock, recorder: deps.recorder };
  const holders = worktreeHolders(every);
  const managed = await Promise.all(
    records.map(async (found) => {
      const base = await managedRow({ ...deps, faro }, found, {
        now,
        listedAs: listedFor(found.id),
        agentSessionId: read.get(found.id),
        window: byLabel.get(targetLabel(windowOf(found))),
        children: children.get(found.id) ?? [],
      });
      const kept = takenOver(found, (path) => holders.get(path));
      const row = kept.length ? { ...base, takenOver: kept } : base;
      // A live session's readings (context use, branch, folder) are read on every look while it
      // works, as a turn can move it (EnterWorktree), and when its state just changed (a reply ends
      // a turn); a session at rest, once read, is not read again. A few ms each, even on a 40 MB
      // transcript; a locked record is not waited for.
      if (row.endedAt || !row.agentSessionId) return row;
      const resting = row.lastState.state !== 'working';
      if (resting && row.lastState.state === found.lastState.state && row.gitBranch !== undefined)
        return row;
      const { context, gitBranch, cwd } = refreshReadings(deps, row, { wait: false });
      return { ...row, context, gitBranch, cwd };
    }),
  );
  // Archived sessions are Mesa's own, so a look at them lists no foreign one.
  const foreign = listed
    .filter(
      (p) =>
        scope !== 'archived' &&
        p.nativeState !== 'stopped' &&
        !runs(p) &&
        !elsewhere.has(p.agentSessionId),
    )
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((process) => foreignRow({ ...deps, faro }, process, now));
  if (scope === 'archived')
    return managed.sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''));
  const rows: SessionRow[] = [...managed, ...(await Promise.all(foreign))];
  return rows.sort((a, b) => b.attention - a.attention || a.startedAt.localeCompare(b.startedAt));
}
