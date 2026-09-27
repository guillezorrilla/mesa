import { closeSync, existsSync, fstatSync, openSync, readdirSync, readSync } from 'node:fs';
import { join } from 'node:path';
import { fileHead } from '../../lib/file-head.js';

// Claude Code's transcripts, `<transcripts>/<folder>/<agent session id>.jsonl`: what Mesa reads
// from them.

// ponytail: the folder is on a transcript's first lines; 1 MiB holds them, read more if one does not.
const HEAD_BYTES = 1 << 20;

// ponytail: looks in every folder; derive the folder from the session's cwd if that gets slow.
/** The transcript of the agent session `id`, in whichever folder holds it. */
export function transcriptFile(transcripts: string, id: string): string | undefined {
  if (!existsSync(transcripts)) return undefined;
  return readdirSync(transcripts)
    .map((folder) => join(transcripts, folder, `${id}.jsonl`))
    .find((f) => existsSync(f));
}

/** The folder a transcript's session ran in: the first line naming one. */
export function transcriptCwd(transcripts: string, id: string): string | undefined {
  const file = transcriptFile(transcripts, id);
  if (!file) return undefined;
  for (const line of fileHead(file, HEAD_BYTES).split('\n')) {
    try {
      const cwd = (JSON.parse(line) as { cwd?: unknown }).cwd;
      if (typeof cwd === 'string') return cwd;
    } catch {
      // A line cut at the end of the head, or not JSON.
    }
  }
  return undefined;
}

/** The usage Claude Code recorded for the context of its last reply. */
type LastUsage = { model: string; tokens: number; at: string };

const TAIL_CHUNK = 1 << 16;

/**
 * The last main-chain assistant message's usage, read from the end of the transcript (one can
 * reach megabytes): its input, cache-creation, and cache-read tokens summed, as the status line
 * counts them (docs/spikes/context-use.md). None when there is no such message yet, or when a
 * compaction came after it, since the next reply is the first that counts again. Reads only
 * `type`, `subtype`, `isSidechain`, `timestamp`, `message.model`, and `message.usage`.
 */
export function lastUsage(file: string): LastUsage | undefined {
  const fd = openSync(file, 'r');
  try {
    let end = fstatSync(fd).size;
    // The bytes read but not yet taken as whole lines, from `end` on.
    let rest = Buffer.alloc(0);
    while (end > 0) {
      const start = Math.max(0, end - TAIL_CHUNK);
      const chunk = Buffer.alloc(end - start);
      readSync(fd, chunk, 0, chunk.length, start);
      end = start;
      rest = Buffer.concat([chunk, rest]);
      // Before the first newline is part of a line that may start earlier, unless the file does.
      const cut = end > 0 ? rest.indexOf(0x0a) : -1;
      if (end > 0 && cut === -1) continue;
      const lines = rest
        .subarray(cut + 1)
        .toString('utf8')
        .split('\n');
      for (const line of lines.reverse()) {
        const found = usageIn(line);
        if (found) return found === 'compacted' ? undefined : found;
      }
      rest = rest.subarray(0, Math.max(cut, 0));
    }
    return undefined;
  } finally {
    closeSync(fd);
  }
}

/** What one transcript line says about context use: a reading, a compaction, or nothing. */
function usageIn(line: string): LastUsage | 'compacted' | undefined {
  // Cheap checks first: most lines are tool results, some of them large.
  if (!line.includes('"assistant"') && !line.includes('compact_boundary')) return undefined;
  let entry: {
    type?: unknown;
    subtype?: unknown;
    isSidechain?: unknown;
    timestamp?: unknown;
    message?: { model?: unknown; usage?: Record<string, unknown> };
  };
  try {
    entry = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (entry.type === 'system' && entry.subtype === 'compact_boundary') return 'compacted';
  const usage = entry.message?.usage;
  if (entry.type !== 'assistant' || entry.isSidechain === true || !usage) return undefined;
  const count = (key: string) => (typeof usage[key] === 'number' ? (usage[key] as number) : 0);
  const { model } = entry.message ?? {};
  if (typeof model !== 'string' || typeof entry.timestamp !== 'string') return undefined;
  return {
    model,
    tokens:
      count('input_tokens') +
      count('cache_creation_input_tokens') +
      count('cache_read_input_tokens'),
    at: entry.timestamp,
  };
}
