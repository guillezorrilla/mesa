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
import { tailLines } from '../../lib/file-tail.js';
import { type LockDeps, lockedBy, withLockSync } from '../../lib/lock-file.js';
import { plainText } from './terminal-text.js';

// A session's output log: everything its window printed, which tmux's pipe-pane appends to
// `sessions/logs/<id>.log` while the config's `sessions.log` is on (ADR-0001). It is the raw
// terminal stream and stays on this machine; what Mesa reads from it is plain text.

/** A log past this size is cut to its last KEEP_BYTES the next time Mesa reads it. */
const MAX_BYTES = 20 * 1024 * 1024;
const KEEP_BYTES = 5 * 1024 * 1024;
/** How much of a log's end a tail reads first; it doubles until it holds the lines asked for. */
const TAIL_BYTES = 64 * 1024;

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
 * What the agent prints during the cut may be lost. Under a lock beside the log, as a stop and
 * the pane-died hook may both cut it: the size is read again once the lock is held, so a second
 * cutter finds the log cut and leaves it, and only bytes read are written back.
 * ponytail: cut only when Mesa reads the log (mesa logs, a stop, an agent's exit); a live session
 * nobody reads grows past 20 MB until then.
 */
function cut(lock: LockDeps, file: string) {
  if (statSync(file).size <= MAX_BYTES) return;
  const path = `${file}.lock`;
  const busy = () => lockedBy(`the output log ${file}`, path, 'output-log');
  withLockSync(
    lock,
    path,
    () => {
      const { size } = statSync(file);
      if (size <= MAX_BYTES) return;
      const tail = Buffer.alloc(KEEP_BYTES);
      const fd = openSync(file, 'r');
      let read = 0;
      try {
        read = readSync(fd, tail, 0, KEEP_BYTES, size - KEEP_BYTES);
      } finally {
        closeSync(fd);
      }
      const kept = tail.subarray(0, read);
      writeFileSync(file, kept.subarray(kept.indexOf(0x0a) + 1));
    },
    busy,
  );
}

/** A raw stretch of the stream as plain lines: trailing spaces and blank lines dropped. */
const plainLines = (raw: string) =>
  plainText(raw)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);

/**
 * The last `lines` lines of session `id`'s output (every line without `lines`), as plain text:
 * escape sequences dropped (plainText), trailing spaces and blank lines too, as a TUI pads its
 * screen with them. Undefined when the session has no log: logging was off when it started, or
 * it has not started. The one reader of a session's output, for people and receipts alike. With
 * `lines` it reads only the log's end, from a whole line, 64 KB first and twice as much until
 * it holds them (tailLines), so a poll of a 20 MB log reads tens of KB.
 */
export function outputTail(
  lock: LockDeps,
  dir: string,
  id: string,
  lines?: number,
): string[] | undefined {
  const file = outputLog(dir, id);
  if (!existsSync(file)) return undefined;
  cut(lock, file);
  if (lines === undefined) return plainLines(readFileSync(file, 'utf8'));
  for (let chunk = TAIL_BYTES; ; chunk *= 2) {
    const read = tailLines(file, chunk);
    const text = plainLines(read.lines.join('\n'));
    if (!read.truncated || text.length >= lines)
      return text.slice(Math.max(0, text.length - lines));
  }
}

/** What `mesa logs` prints: a session's output lines, and its log's path, null when it has none. */
export type SessionLog = { session: string; path: string | null; lines: string[] };

/** Session `id`'s output (outputTail) as `mesa logs` prints it. */
export function sessionLog(lock: LockDeps, dir: string, id: string, lines?: number): SessionLog {
  const text = outputTail(lock, dir, id, lines);
  return { session: id, path: text ? outputLog(dir, id) : null, lines: text ?? [] };
}
