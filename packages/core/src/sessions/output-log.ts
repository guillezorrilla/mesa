import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { plainText } from '../lib/terminal-text.js';

// A session's output log: everything its window printed, which tmux's pipe-pane appends to
// `sessions/logs/<id>.log` while the config's `sessions.log` is on (ADR-0001). It is the raw
// terminal stream and stays on this machine; what Mesa reads from it is plain text.

/** A log past this size is cut to its last KEEP_BYTES the next time Mesa reads it. */
const MAX_BYTES = 20 * 1024 * 1024;
const KEEP_BYTES = 5 * 1024 * 1024;

/** Where session `id`'s output log is, in the profile's logs folder. */
export const outputLog = (dir: string, id: string) => join(dir, `${id}.log`);

/** The log a new window's output goes to, its folder made, so the pipe's `cat >>` can create it. */
export function prepareOutputLog(dir: string, id: string) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return outputLog(dir, id);
}

/**
 * Cuts a log over MAX_BYTES to its last KEEP_BYTES, from the first whole line, in place: the
 * window's `cat >>` keeps appending to the same file, which a rename would take away from it.
 * What the agent prints during the cut may be lost.
 * ponytail: cut only when Mesa reads the log (mesa logs, a stop, an agent's exit); a live session
 * nobody reads grows past 20 MB until then.
 */
function cut(file: string) {
  const { size } = statSync(file);
  if (size <= MAX_BYTES) return;
  const tail = Buffer.alloc(KEEP_BYTES);
  const fd = openSync(file, 'r');
  try {
    readSync(fd, tail, 0, KEEP_BYTES, size - KEEP_BYTES);
  } finally {
    closeSync(fd);
  }
  writeFileSync(file, tail.subarray(tail.indexOf(0x0a) + 1));
}

/**
 * The last `lines` lines of session `id`'s output (every line without `lines`), as plain text:
 * escape sequences dropped (plainText), trailing spaces and blank lines too, as a TUI pads its
 * screen with them. Undefined when the session has no log: logging was off when it started, or
 * it has not started. The one reader of a session's output, for people and receipts alike.
 */
export function outputTail(dir: string, id: string, lines?: number): string[] | undefined {
  const file = outputLog(dir, id);
  if (!existsSync(file)) return undefined;
  cut(file);
  const text = plainText(readFileSync(file, 'utf8'))
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);
  return lines === undefined ? text : text.slice(Math.max(0, text.length - lines));
}

/** What `mesa logs` prints: a session's output lines, and its log's path, null when it has none. */
export type SessionLog = { session: string; path: string | null; lines: string[] };

/** Session `id`'s output (outputTail) as `mesa logs` prints it. */
export function sessionLog(dir: string, id: string, lines?: number): SessionLog {
  const text = outputTail(dir, id, lines);
  return { session: id, path: text ? outputLog(dir, id) : null, lines: text ?? [] };
}
