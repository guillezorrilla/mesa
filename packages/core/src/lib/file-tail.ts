import { closeSync, fstatSync, openSync, readSync } from 'node:fs';

const CHUNK = 1 << 16;

/** Find the last useful JSONL line without loading an entire growing transcript. */
export function lastMatchingLine<T>(
  file: string,
  read: (line: string) => T | undefined,
): T | undefined {
  const fd = openSync(file, 'r');
  try {
    let end = fstatSync(fd).size;
    let rest = Buffer.alloc(0);
    while (end > 0) {
      const start = Math.max(0, end - CHUNK);
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
