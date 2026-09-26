import { closeSync, existsSync, openSync, readdirSync, readSync } from 'node:fs';
import { join } from 'node:path';

// Claude Code's transcripts, `<transcripts>/<folder>/<agent session id>.jsonl`: what Mesa reads
// from them.

// ponytail: the folder is on a transcript's first lines; 1 MiB holds them, read more if one does not.
const HEAD_BYTES = 1 << 20;

/** The folder a transcript's session ran in: the first line naming one. */
export function transcriptCwd(transcripts: string, id: string): string | undefined {
  if (!existsSync(transcripts)) return undefined;
  const file = readdirSync(transcripts)
    .map((folder) => join(transcripts, folder, `${id}.jsonl`))
    .find((f) => existsSync(f));
  if (!file) return undefined;
  const fd = openSync(file, 'r');
  const head = Buffer.alloc(HEAD_BYTES);
  const read = (() => {
    try {
      return readSync(fd, head, 0, HEAD_BYTES, 0);
    } finally {
      closeSync(fd);
    }
  })();
  for (const line of head.subarray(0, read).toString('utf8').split('\n')) {
    try {
      const cwd = (JSON.parse(line) as { cwd?: unknown }).cwd;
      if (typeof cwd === 'string') return cwd;
    } catch {
      // A line cut at the end of the head, or not JSON.
    }
  }
  return undefined;
}
