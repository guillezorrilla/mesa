import { clip } from '../../lib/clip.js';
import { firstLine } from '../../lib/format.js';
import type { PendingPrompt } from '../../sessions/answer/pending.js';
import type { ManagedRow, SessionRow } from '../../sessions/board/rows.js';
import { sessionTitle } from '../../sessions/record/labels.js';
import { WAITING_STATES } from '../../sessions/record/states.js';
import type { PhoneRow } from '../protocol/rpc.js';

/**
 * The phone's rows: the board's Mesa sessions, in its attention order, each cut to what a list
 * shows. Foreign sessions stay off: the phone acts on sessions, and those are read-only.
 */
export const phoneRows = (board: readonly SessionRow[]): PhoneRow[] =>
  board.filter((row): row is ManagedRow => row.managed).map(toPhoneRow);

export const toPhoneRow = (row: ManagedRow): PhoneRow => ({
  id: row.id,
  title: sessionTitle(row),
  project: row.project ?? null,
  state: row.lastState.state,
  since: row.lastState.at,
  context: row.context ? Math.round(row.context.used) : null,
  unread: Boolean(row.unread),
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
 * The rows with each waiting session's `ask` read through `prompt`; a prompt that does not read
 * leaves the row as it is.
 * ponytail: one pane capture per waiting session per look (every 2 s while a phone watches);
 * keep the last ask per state time if many waiting sessions make it slow.
 */
export const askedRows = (rows: PhoneRow[], prompt: (id: string) => Promise<PendingPrompt>) =>
  Promise.all(
    rows.map(async (row) => {
      if (!(WAITING_STATES as ReadonlySet<string>).has(row.state)) return row;
      const ask = await prompt(row.id).then(askLine, () => undefined);
      return ask ? { ...row, ask } : row;
    }),
  );

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
