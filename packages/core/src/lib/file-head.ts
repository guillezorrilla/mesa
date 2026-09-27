import { closeSync, openSync, readSync } from 'node:fs';

/** The first `bytes` of a file, as UTF-8 (a character cut at the end reads as U+FFFD). */
export function fileHead(file: string, bytes: number): string {
  const fd = openSync(file, 'r');
  try {
    const head = Buffer.alloc(bytes);
    return head.subarray(0, readSync(fd, head, 0, bytes, 0)).toString('utf8');
  } finally {
    closeSync(fd);
  }
}
