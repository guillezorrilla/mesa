import { splitMessage } from './cloud-entry.js';
import { jsonObject, jsonTerms, jsonTitle } from './json-message.js';
import { normalizedMessage } from './normalize.js';

// An error group's occurrences in Errors mode (CONTEXT.md, Cloud Logs): the text that reads them
// from Logging, and identical ones (differing only in times and ids) as one run. Pure, so the app
// bundles it (`@mesa/core/browser`).

/** A source file and line in a frame (`TableStore.java:41`): kept, as it names the error, its line dropped. */
const FILE_LINE = /^([\w.$-]+\.[a-z]{1,5}):\d+\)?$/i;

/**
 * An error's title for a compact row: its first line without the words that vary between
 * occurrences (ids, numbers, times), a source file kept without its line number.
 */
export function plainTitle(message: string) {
  const json = jsonObject(splitMessage(message).head);
  if (json) return jsonTitle(json) ?? 'JSON message';
  const words = splitMessage(message)
    .head.split(/\s+/)
    .flatMap((word) => {
      const file = FILE_LINE.exec(word);
      if (file) return [file[1] as string];
      return /\d/.test(word) ? [] : [word];
    });
  return words.join(' ').trim() || splitMessage(message).head;
}

const SEPARATORS = ' \t:=,;.()[]{}-"\'';

/** `part` without separators at either end (a loop: an end-anchored regex is slow on long runs). */
function trimSeparators(part: string) {
  let start = 0;
  let end = part.length;
  while (start < end && SEPARATORS.includes(part[start] as string)) start++;
  while (end > start && SEPARATORS.includes(part[end - 1] as string)) end--;
  return part.slice(start, end);
}

/**
 * The search terms every message of `message`'s group holds: a JSON message's naming values, else
 * the longest literal parts between what varies (normalizedMessage), at most three.
 */
export function groupTerms(message: string) {
  const head = splitMessage(message).head;
  const json = jsonObject(head);
  if (json) return jsonTerms(json);
  // Stricter than grouping: a word with a digit anywhere (LC-04) is no term of the group.
  const words = head.split(/\s+/).map((w) => (/\d/.test(w) ? '#' : w));
  return normalizedMessage(words.join(' '))
    .split('#')
    .map(trimSeparators)
    .filter((part) => part.length >= 4)
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
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
