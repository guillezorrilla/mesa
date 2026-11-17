import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { scanLines } from './file-lines.js';

/** How many files a process keeps read, and how long one stays kept after its last read. */
export const LIVE_FILES = 4;
export const LIVE_IDLE_MS = 5 * 60_000;
/** How many bytes before the offset are checked to see the file was only appended to. */
const MARK = 256;

type Kept = {
  /** The file's identity (device and inode), so a replaced file is read anew. */
  id: string;
  parse: (line: string) => unknown;
  /** Where the next read starts: after the last whole line read. */
  offset: number;
  /** The bytes just before `offset`, so a file rewritten in place is read anew. */
  mark: Buffer;
  lines: { start: number; value: unknown }[];
  at: number;
};

const kept = new Map<string, Kept>();

/**
 * The lines in the last `bytes` of `file`, each as `parse` reads it, oldest first, and whether
 * the file is longer: tailLines' lines, a line cut by the limit left out. Whole lines are kept
 * per file between calls, so a call after the file grew reads and parses only the lines written
 * since: a live view of a long transcript re-reads kilobytes, not megabytes. A last line with no
 * newline yet is parsed on each call until it has one. A file that shrank, was replaced or was
 * rewritten is read anew. A process keeps LIVE_FILES files, the least recently read dropped
 * first, and drops one LIVE_IDLE_MS after its last read, at the next call.
 */
export function liveTail<T>(
  file: string,
  bytes: number,
  parse: (line: string) => T,
): { values: T[]; truncated: boolean } {
  const now = Date.now();
  for (const [key, each] of kept) if (now - each.at >= LIVE_IDLE_MS) kept.delete(key);
  const stat = statSync(file);
  const id = `${stat.dev}:${stat.ino}`;
  const floor = Math.max(0, stat.size - bytes);
  const last = kept.get(file);
  const read: Kept =
    last &&
    last.id === id &&
    last.parse === parse &&
    last.offset <= stat.size &&
    last.offset >= floor &&
    bytesAt(file, last.offset - last.mark.length, last.offset).equals(last.mark)
      ? last
      : // A first read, or one after the file outgrew what was kept, starts at the limit; the
        // line it cuts starts at `floor` and is left out.
        { id, parse, offset: floor, mark: Buffer.alloc(0), lines: [], at: now };
  kept.delete(file);
  kept.set(file, read);
  if (kept.size > LIVE_FILES) kept.delete(kept.keys().next().value as string);
  read.at = now;
  try {
    const from = read.offset;
    read.offset = scanLines(file, from, (line, start) => {
      if (start > floor || floor === 0) read.lines.push({ start, value: parse(line) });
    });
    if (read.offset !== from)
      read.mark = bytesAt(file, Math.max(0, read.offset - MARK), read.offset);
  } catch (error) {
    kept.delete(file); // A read that failed partway is not kept half done.
    throw error;
  }
  if (floor > 0) {
    const inside = read.lines.findIndex((line) => line.start > floor);
    read.lines.splice(0, inside < 0 ? read.lines.length : inside);
  }
  const values = read.lines.map((line) => line.value as T);
  // The last line, with no newline yet, is read as tailLines reads it but not kept: it may be
  // half written.
  if (read.offset < stat.size && (read.offset > floor || floor === 0))
    values.push(parse(bytesAt(file, read.offset, stat.size).toString('utf8')));
  return { values, truncated: floor > 0 };
}

/** The bytes of `file` from `start` to `end`, fewer when it is shorter. */
function bytesAt(file: string, start: number, end: number) {
  const fd = openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(end - start);
    return buffer.subarray(0, readSync(fd, buffer, 0, buffer.length, start));
  } finally {
    closeSync(fd);
  }
}

/** How many files liveTail holds now, for tests. */
export const liveTailHeld = () => kept.size;
