import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileHead } from '../../lib/file-head.js';
import { lastMatchingLine } from '../../lib/file-tail.js';

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

/**
 * The last main-chain assistant message's usage, read from the end of the transcript (one can
 * reach megabytes): its input, cache-creation, and cache-read tokens summed, as the status line
 * counts them (docs/spikes/context-use.md). None when there is no such message yet, or when a
 * compaction came after it, since the next reply is the first that counts again. Reads only
 * `type`, `subtype`, `isSidechain`, `timestamp`, `message.model`, and `message.usage`.
 */
export function lastUsage(file: string): LastUsage | undefined {
  const found = lastMatchingLine(file, usageIn);
  return found === 'compacted' ? undefined : found;
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
