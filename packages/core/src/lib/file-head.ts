import { closeSync, openSync, readSync } from 'node:fs';

const FIRST_STEP = 32 << 10;

/**
 * The start of a file as UTF-8 (a character cut at the end reads as U+FFFD), read in steps that
 * double from 32 KiB, until `enough` says the head so far holds what its caller needs, the file
 * ends, or `limit` bytes are read.
 */
export function fileHead(file: string, limit: number, enough: (head: string) => boolean): string {
  const fd = openSync(file, 'r');
  try {
    let head = Buffer.alloc(0);
    for (let step = FIRST_STEP; ; step *= 2) {
      const chunk = Buffer.alloc(Math.min(step, limit - head.length));
      const read = readSync(fd, chunk, 0, chunk.length, head.length);
      head = Buffer.concat([head, chunk.subarray(0, read)]);
      const text = head.toString('utf8');
      if (read < chunk.length || head.length >= limit || enough(text)) return text;
    }
  } finally {
    closeSync(fd);
  }
}
