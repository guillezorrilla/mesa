import { closeSync, createReadStream, openSync, readSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';

/**
 * Each complete line appended to an append-only file since byte `offset` (from the start again
 * when the file is now shorter), without loading the whole file; returns the offset after the
 * last complete line, where the next scan starts. A line still being written waits for it.
 */
export function scanLines(file: string, offset: number, onLine: (line: string) => void): number {
  const size = statSync(file).size;
  let position = offset <= size ? offset : 0;
  let complete = position;
  let pending: Buffer[] = [];
  let pendingBytes = 0;
  const fd = openSync(file, 'r');
  try {
    while (position < size) {
      const buffer = Buffer.alloc(Math.min(64 * 1024, size - position));
      const count = readSync(fd, buffer, 0, buffer.length, position);
      if (count === 0) break;
      position += count;
      const chunk = buffer.subarray(0, count);
      let start = 0;
      for (let end = chunk.indexOf(10, start); end !== -1; end = chunk.indexOf(10, start)) {
        const line = chunk.subarray(start, end);
        onLine(
          (pendingBytes
            ? Buffer.concat([...pending, line], pendingBytes + line.length)
            : line
          ).toString('utf8'),
        );
        pending = [];
        pendingBytes = 0;
        start = end + 1;
      }
      if (start < chunk.length) {
        pending.push(chunk.subarray(start));
        pendingBytes += chunk.length - start;
      }
      complete = position - pendingBytes;
    }
  } finally {
    closeSync(fd);
  }
  return complete;
}

/** Every line of `files`, one file after another, streamed rather than loaded whole. */
export async function* streamLines(files: readonly string[]) {
  for (const file of files)
    yield* createInterface({ input: createReadStream(file), crlfDelay: Infinity });
}
