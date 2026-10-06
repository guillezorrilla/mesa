import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

/**
 * Counts what `node:fs` opens and reads from now on, through its `openSync` and `readSync`: each
 * path opened, in order, and the bytes read. `restore` puts both back.
 */
export function countReads() {
  const { openSync, readSync } = fs;
  const opened: string[] = [];
  let bytes = 0;
  fs.openSync = ((...args: Parameters<typeof openSync>) => {
    opened.push(String(args[0]));
    return openSync(...args);
  }) as typeof fs.openSync;
  fs.readSync = ((...args: Parameters<typeof readSync>) => {
    const n = readSync(...args);
    bytes += n;
    return n;
  }) as typeof fs.readSync;
  syncBuiltinESMExports();
  return {
    opened,
    bytes: () => bytes,
    restore: () => {
      Object.assign(fs, { openSync, readSync });
      syncBuiltinESMExports();
    },
  };
}
