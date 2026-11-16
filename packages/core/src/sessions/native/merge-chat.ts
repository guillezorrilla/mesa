import type { ChatItem } from './chat.js';

/** How far apart the transcript and the stream may stamp one item (measured: under a second). */
const SAME_MS = 5_000;
/** Whether two stamps may be one item's: either unknown, or within SAME_MS. */
const near = (a: string | null, b: string | null) =>
  !a || !b || Math.abs(Date.parse(a) - Date.parse(b)) <= SAME_MS;

/**
 * What makes two items the same one across the transcript and the stream: a run's id or a shared
 * step, else who said what, said within moments (a `/usage` run again later is another).
 */
const same = (a: ChatItem, b: ChatItem) =>
  a.from === b.from &&
  (a.from === 'steps' && b.from === 'steps'
    ? a.id === b.id || a.steps.some((step) => b.steps.some((other) => other.id === step.id))
    : a.from !== 'steps' && b.from !== 'steps' && a.text === b.text && near(a.at, b.at));

/**
 * The transcript's chat (`history`, oldest first) with the stream's items (`live`, oldest first)
 * after it. The transcript catches up with the stream after a moment, and a resume replays what
 * the stream already showed, so the place in `history` where `live` begins with the longest
 * overlap is kept once, as the transcript has it, and only the items past the transcript's end are
 * added; nothing is reordered. Live items older than the transcript's window are left out with it.
 * shortcut: a prompt sent again before the transcript has the first reads as one, and an item has
 * no id both sources share; upgrade when the host writes the transcript's revision into the journal.
 */
export function mergeChat(history: ChatItem[], live: ChatItem[]): ChatItem[] {
  const first = live[0];
  if (!first) return history;
  const matches = (at: number, from: number, length: number) =>
    history.slice(at, at + length).every((item, i) => same(item, live[from + i] as ChatItem));
  // Earliest first, so the longest overlap wins: `/config` run twice in a row is two items in both.
  for (let start = 0; start < history.length; start++) {
    const overlap = Math.min(live.length, history.length - start);
    if (matches(start, 0, overlap)) return [...history, ...live.slice(overlap)];
  }
  // The stream began before the transcript's window (a long session, or a small count): what
  // came before the window stays out, as the transcript leaves it out.
  for (let from = 1; from < live.length && history.length; from++) {
    const overlap = Math.min(history.length, live.length - from);
    if (matches(0, from, overlap)) return [...history, ...live.slice(from + overlap)];
  }
  // No place lines up (an item one source has and the other lacks): an item the transcript has
  // already is not shown again, so one run again since (a second
  // `/usage`) still shows; what came before the transcript's window stays out with it.
  const since = history[0]?.at;
  return [
    ...history,
    ...live.filter(
      (item) => !(since && item.at && item.at < since) && !history.some((had) => same(had, item)),
    ),
  ];
}
