import { randomUUID } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  linkSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

/**
 * Writes `text` to a temp file beside `path`, flushes it to disk, then renames it over `path`: a
 * reader sees the old file or the new one, never half of either, even after a crash.
 */
export function writeFileAtomic(path: string, text: string | Uint8Array, mode?: number): void {
  const temp = writeTemp(path, text, mode);
  try {
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

/**
 * Creates `path` with `text`, whole or not at all, unless it exists: then false, and nothing
 * changes. A hard link, unlike a rename, never replaces a file.
 */
export function createFileAtomic(path: string, text: string, mode?: number): boolean {
  const temp = writeTemp(path, text, mode);
  try {
    linkSync(temp, path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  } finally {
    rmSync(temp, { force: true });
  }
}

/** `text` in a new temp file beside `path`, flushed to disk. */
function writeTemp(path: string, text: string | Uint8Array, mode?: number): string {
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    const fd = openSync(temp, 'wx', mode);
    try {
      writeFileSync(fd, text);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    return temp;
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}
