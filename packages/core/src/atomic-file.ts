import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, openSync, renameSync, rmSync, writeSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/**
 * Writes `text` to a temp file beside `path`, flushes it to disk, then renames it over `path`: a
 * reader sees the old file or the new one, never half of either, even after a crash.
 */
export function writeFileAtomic(path: string, text: string): void {
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    const fd = openSync(temp, 'wx');
    try {
      writeSync(fd, text);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}
