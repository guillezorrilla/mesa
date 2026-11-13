import { clip } from '../../lib/clip.js';
import { firstLine } from '../../lib/format.js';
import type { PendingPrompt } from '../../sessions/answer/pending.js';
import { listedSession } from '../../sessions/board/listed.js';
import type { ManagedRow, SessionRow } from '../../sessions/board/rows.js';
import { sessionTitle } from '../../sessions/record/labels.js';
import { WAITING_STATES } from '../../sessions/record/states.js';
import type { PhoneRow } from '../protocol/rpc.js';

/**
 * The phone's rows: the board's sessions the sidebar lists (listedSession), in its attention
 * order, each cut to what a list shows. Foreign sessions stay off: the phone acts on sessions,
 * and those are read-only.
 */
export const phoneRows = (board: readonly SessionRow[]): PhoneRow[] =>
  managedRows(board).filter(listedSession).map(toPhoneRow);

/** The board's Mesa sessions, listed or not: Usage counts an ended session's cost too. */
export const managedRows = (board: readonly SessionRow[]) =>
  board.filter((row): row is ManagedRow => row.managed);

export const toPhoneRow = (row: ManagedRow): PhoneRow => ({
  id: row.id,
  title: sessionTitle(row),
  project: row.project ?? null,
  state: row.lastState.state,
  since: row.lastState.at,
  context: row.context ? Math.round(row.context.used) : null,
  unread: Boolean(row.unread),
  ...(row.agent === 'terminal' ? { terminal: true as const } : {}),
});

/** The longest `ask` a row carries: a list shows one line. */
const ASK_MAX = 120;

/** A pending prompt in one line: the tool it asks for, then the first line of what it asks. */
export function askLine(prompt: PendingPrompt): string | undefined {
  if (prompt.status !== 'pending') return undefined;
  const first = firstLine(prompt.summary);
  const line = prompt.tool && prompt.kind === 'permission' ? `${prompt.tool}: ${first}` : first;
  return clip(line, ASK_MAX) || undefined;
}

/**
 * Each waiting row's `ask`, read through `prompt` (a pane capture) only when the session changed
 * since the read that gave it: its state or its time moved, or `forget` was told its hook log
 * changed (a new prompt in the same state). A prompt that does not read (its pane not drawn yet)
 * leaves the row as it is and calls `unread`, so the next look reads it once more; one that still
 * does not read (a prompt Mesa cannot read) is left until the session changes.
 */
export function keptAsks(prompt: (id: string) => Promise<PendingPrompt>, unread: () => void) {
  const kept = new Map<string, { key: string; ask: Promise<string | undefined> }>();
  const missed = new Map<string, string>();
  const askOf = (row: PhoneRow) => {
    const key = `${row.state} ${row.since}`;
    const hit = kept.get(row.id);
    if (hit?.key === key) return hit.ask;
    const entry = { key, ask: prompt(row.id).then(askLine, () => undefined) };
    kept.set(row.id, entry);
    void entry.ask.then((ask) => {
      if (ask || missed.get(row.id) === key || kept.get(row.id) !== entry) return;
      missed.set(row.id, key);
      kept.delete(row.id);
      unread();
    });
    return entry.ask;
  };
  const waiting = (row: PhoneRow) => (WAITING_STATES as ReadonlySet<string>).has(row.state);
  return {
    read: (rows: PhoneRow[]) => {
      const now = new Set(rows.filter(waiting).map((row) => row.id));
      for (const id of kept.keys()) if (!now.has(id)) kept.delete(id);
      for (const id of missed.keys()) if (!now.has(id)) missed.delete(id);
      return Promise.all(
        rows.map(async (row) => {
          if (!waiting(row)) return row;
          const ask = await askOf(row);
          return ask ? { ...row, ask } : row;
        }),
      );
    },
    forget: (id: string) => {
      kept.delete(id);
      missed.delete(id);
    },
  };
}

/**
 * The rows with how many replies each session has queued, so a reply queued or removed on the
 * Mac changes the row, and a watching phone hears of it in the next update.
 */
export function queuedRows(rows: PhoneRow[], queued: readonly { session: string }[]): PhoneRow[] {
  const count = new Map<string, number>();
  for (const { session } of queued) count.set(session, (count.get(session) ?? 0) + 1);
  return rows.map((row) => {
    const n = count.get(row.id);
    return n ? { ...row, queued: n } : row;
  });
}

/**
 * What changed from `before` to `after`: rows new or different, ids no longer listed, and the
 * order now; none when nothing did.
 */
export function rowChanges(before: readonly PhoneRow[], after: readonly PhoneRow[]) {
  const was = new Map(before.map((row) => [row.id, JSON.stringify(row)]));
  const now = new Set(after.map((row) => row.id));
  const rows = after.filter((row) => was.get(row.id) !== JSON.stringify(row));
  const gone = before.filter((row) => !now.has(row.id)).map((row) => row.id);
  const order = after.map((row) => row.id);
  const moved = order.join() !== before.map((row) => row.id).join();
  return rows.length || gone.length || moved ? { rows, gone, order } : undefined;
}
