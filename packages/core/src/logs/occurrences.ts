import { splitMessage } from './cloud-entry.js';
import { normalizedMessage } from './groups.js';

// An error group's occurrences in Errors mode (CONTEXT.md, Cloud Logs): the text that reads them
// from Logging, and identical ones (differing only in times and ids) as one run. Pure, so the app
// bundles it (`@mesa/core/browser`).

/**
 * The words of an error group's message that every occurrence holds: its first line up to the
 * first word with a digit (an id, a count, a time), at most 80 characters; what `--text` reads its
 * occurrences with.
 */
export function groupText(message: string) {
  const words: string[] = [];
  for (const word of splitMessage(message).head.split(/\s+/)) {
    if (/\d/.test(word)) break;
    words.push(word);
  }
  // Trailing separators trimmed by a loop: a regex anchored at the end is slow on long runs of them.
  let text = words.join(' ');
  while (text && ' :=,;([{-'.includes(text.at(-1) as string)) text = text.slice(0, -1);
  return text.slice(0, 80);
}

/** A source file and line in a frame (`TableStore.java:41`): kept, as it names the error, its line dropped. */
const FILE_LINE = /^([\w.$-]+\.[a-z]{1,5}):\d+\)?$/i;

/**
 * An error's title for a compact row: its first line without the words that vary between
 * occurrences (ids, numbers, times), a source file kept without its line number.
 */
export function plainTitle(message: string) {
  const words = splitMessage(message)
    .head.split(/\s+/)
    .flatMap((word) => {
      const file = FILE_LINE.exec(word);
      if (file) return [file[1] as string];
      return /\d/.test(word) ? [] : [word];
    });
  return words.join(' ').trim() || splitMessage(message).head;
}

/** A run of identical occurrences, newest first as read: one row, or one when it stands alone. */
export type Run<E> = { entries: E[]; newest: string; oldest: string };

/** `entries` (newest first) with each stretch of identical neighbours (normalizedMessage) as one run. */
export function occurrenceRuns<E extends { time: string; message: string }>(entries: readonly E[]) {
  const runs: Run<E>[] = [];
  let key = '';
  for (const entry of entries) {
    const next = normalizedMessage(splitMessage(entry.message).head);
    const last = runs.at(-1);
    if (last && next === key) {
      last.entries.push(entry);
      last.oldest = entry.time;
    } else runs.push({ entries: [entry], newest: entry.time, oldest: entry.time });
    key = next;
  }
  return runs;
}
