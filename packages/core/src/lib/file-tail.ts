import { closeSync, fstatSync, openSync, readSync } from 'node:fs';

const CHUNK = 1 << 16;

/**
 * Find the last useful JSONL line without loading an entire growing transcript. With `limit`, only
 * the last `limit` bytes are read and a line cut at that limit is skipped.
 */
export function lastMatchingLine<T>(
  file: string,
  read: (line: string) => T | undefined,
  limit?: number,
): T | undefined {
  const fd = openSync(file, 'r');
  try {
    let end = fstatSync(fd).size;
    const floor = limit === undefined ? 0 : Math.max(0, end - limit);
    let rest = Buffer.alloc(0);
    while (end > floor) {
      const start = Math.max(floor, end - CHUNK);
      const chunk = Buffer.alloc(end - start);
      readSync(fd, chunk, 0, chunk.length, start);
      end = start;
      rest = Buffer.concat([chunk, rest]);
      const cut = end > 0 ? rest.indexOf(0x0a) : -1;
      if (end > 0 && cut === -1) continue;
      for (const line of rest
        .subarray(cut + 1)
        .toString('utf8')
        .split('\n')
        .reverse()) {
        const found = read(line);
        if (found !== undefined) return found;
      }
      rest = rest.subarray(0, Math.max(cut, 0));
    }
    return undefined;
  } finally {
    closeSync(fd);
  }
}

/** The lines in the last `bytes` of `file`; a partial first line is never returned. */
export function tailLines(file: string, bytes: number): { lines: string[]; truncated: boolean } {
  const fd = openSync(file, 'r');
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const buffer = Buffer.alloc(size - start);
    const read = readSync(fd, buffer, 0, buffer.length, start);
    const text = buffer.subarray(0, read).toString('utf8');
    const lines = text.split('\n');
    if (start) lines.shift();
    return { lines, truncated: start > 0 };
  } finally {
    closeSync(fd);
  }
}
