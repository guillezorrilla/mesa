import { type Dirent, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileHead } from '../../lib/file-head.js';
import { lastMatchingLine, tailLines } from '../../lib/file-tail.js';
import {
  type Block,
  firstPromptIn,
  MESSAGE_TAIL,
  messageOf,
  named,
  parsedLine,
  type Transcripts,
  type Where,
} from '../transcripts.js';
import { claudeTranscripts } from './paths.js';

// Claude Code's transcripts, `<transcripts>/<folder>/<agent session id>.jsonl`: what Mesa reads
// from them.

// ponytail: the folder is on a transcript's first lines, read up to 1 MiB; read more if one is not.
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
  return cwdIn(file);
}

/** The first line of `file` naming a cwd, read only until one does. */
function cwdIn(file: string): string | undefined {
  return cwdOf(fileHead(file, HEAD_BYTES, (head) => cwdOf(head) !== undefined));
}

function cwdOf(head: string): string | undefined {
  for (const line of head.split('\n')) {
    try {
      const cwd = (JSON.parse(line) as { cwd?: unknown }).cwd;
      if (typeof cwd === 'string') return cwd;
    } catch {
      // A line cut at the end of the head, or not JSON.
    }
  }
  return undefined;
}

/**
 * Native Claude conversations on disk, each with its transcript `file`; with `since` (epoch ms),
 * only those last written then or later, the others not opened.
 */
export function claudeHistory(transcripts: string, since?: number) {
  if (!existsSync(transcripts)) return [];
  const rows: { agent: 'claude'; id: string; cwd: string; updatedAt: string; file: string }[] = [];
  let folders: Dirent[];
  try {
    folders = readdirSync(transcripts, { withFileTypes: true });
  } catch {
    return rows;
  }
  for (const folder of folders) {
    if (!folder.isDirectory()) continue;
    const dir = join(transcripts, folder.name);
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (
        !entry.isFile() ||
        !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.jsonl$/.test(entry.name)
      )
        continue;
      const file = join(dir, entry.name);
      try {
        const { mtime } = statSync(file);
        if (since !== undefined && mtime.getTime() < since) continue;
        const cwd = cwdIn(file);
        if (cwd)
          rows.push({
            agent: 'claude',
            id: entry.name.slice(0, -6),
            cwd,
            updatedAt: mtime.toISOString(),
            file,
          });
      } catch {
        // A transcript may disappear while native history is read.
      }
    }
  }
  return rows;
}

/** The usage Claude Code recorded for the context of its last reply. */
type LastUsage = { model: string; tokens: number; at: string; effort?: string };

/**
 * The last main-chain assistant message's usage, read from the end of the transcript (one can
 * reach megabytes): its input, cache-creation, and cache-read tokens summed, as the status line
 * counts them (docs/spikes/context-use.md). None when there is no such message yet, or when a
 * compaction came after it, since the next reply is the first that counts again.
 */
export function lastUsage(file: string): LastUsage | undefined {
  const found = lastMatchingLine(file, usageIn);
  return found === 'compacted' ? undefined : found;
}

/** What one transcript line says about context use: a reading, a compaction, or nothing. */
function usageIn(line: string): LastUsage | 'compacted' | undefined {
  const entry = usageLine(line);
  if (!entry || entry === 'compacted') return entry;
  const { model, timestamp, effort, usage } = entry;
  if (entry.sidechain || typeof model !== 'string' || typeof timestamp !== 'string')
    return undefined;
  const count = (key: string) => (typeof usage[key] === 'number' ? (usage[key] as number) : 0);
  return {
    model,
    tokens:
      count('input_tokens') +
      count('cache_creation_input_tokens') +
      count('cache_read_input_tokens'),
    at: timestamp,
    ...(typeof effort === 'string' && effort ? { effort } : {}),
  };
}

/** An assistant message's usage as one transcript line holds it, its fields not yet checked. */
export type UsageLine = {
  id: unknown;
  model: unknown;
  timestamp: unknown;
  effort: unknown;
  sidechain: boolean;
  usage: Record<string, unknown>;
};

/**
 * The assistant message with its usage that one transcript line holds, a compaction, or nothing:
 * what context use (lastUsage) and the usage ledger (usage.ts) both read. Reads only `type`,
 * `subtype`, `isSidechain`, `timestamp`, `effort`, `perTurnEffort`, `message.id`,
 * `message.model`, and `message.usage`.
 */
export function usageLine(line: string): UsageLine | 'compacted' | undefined {
  // Cheap checks first: most lines are tool results, some of them large.
  if (
    !line.includes('compact_boundary') &&
    !(line.includes('"assistant"') && line.includes('"usage"'))
  )
    return undefined;
  let entry: {
    type?: unknown;
    subtype?: unknown;
    isSidechain?: unknown;
    timestamp?: unknown;
    effort?: unknown;
    perTurnEffort?: unknown;
    message?: { id?: unknown; model?: unknown; usage?: Record<string, unknown> };
  };
  try {
    entry = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (entry.type === 'system' && entry.subtype === 'compact_boundary') return 'compacted';
  const usage = entry.message?.usage;
  if (entry.type !== 'assistant' || !usage) return undefined;
  return {
    id: entry.message?.id,
    model: entry.message?.model,
    timestamp: entry.timestamp,
    effort: entry.perTurnEffort ?? entry.effort,
    sidechain: entry.isSidechain === true,
    usage,
  };
}

/** How far back from a transcript's end its name is looked for. */
const NAME_TAIL = 1 << 20;

/**
 * A transcript's name: the `customTitle` of its latest `custom-title` entry (the person's), else
 * the `aiTitle` of its latest `ai-title` entry, both within its last `NAME_TAIL` bytes. One pass
 * from the end, which stops at a custom title.
 */
function claudeName(file: string): string | undefined {
  let ai: string | undefined;
  const custom = lastMatchingLine(
    file,
    (line) => {
      // Cheap check first: most lines are messages and tool results.
      if (!line.includes('-title"')) return undefined;
      let entry: { type?: unknown; customTitle?: unknown; aiTitle?: unknown };
      try {
        entry = JSON.parse(line);
      } catch {
        return undefined;
      }
      if (entry.type === 'custom-title') return named(entry.customTitle);
      if (entry.type === 'ai-title') ai ??= named(entry.aiTitle);
      return undefined;
    },
    NAME_TAIL,
  );
  return custom ?? ai;
}

/** One transcript line, parsed: the fields its prompt and messages are read from. */
type Line = {
  type?: unknown;
  isSidechain?: unknown;
  isMeta?: unknown;
  timestamp?: unknown;
  message?: { role?: unknown; content?: unknown };
};

/** The person's text in one transcript line, if it is theirs. */
function userText(line: Line): unknown[] {
  if (line.type !== 'user' || line.isMeta || line.message?.role !== 'user') return [];
  const content = line.message.content;
  return typeof content === 'string'
    ? [content]
    : Array.isArray(content)
      ? content.filter((b: Block) => b.type === 'text').map((b: Block) => b.text)
      : [];
}

/**
 * The message a user or assistant line holds, excluding sidechains and meta lines: Claude Code
 * writes loaded skill bodies and reminders as meta user lines, not the person's.
 */
function messageIn(line: string) {
  const entry = parsedLine<Line>(line);
  if (
    !entry ||
    (entry.type !== 'user' && entry.type !== 'assistant') ||
    entry.isSidechain === true ||
    entry.isMeta === true
  )
    return undefined;
  return messageOf(entry.message, entry.timestamp, line);
}

/** Conversation `id`'s transcript. */
const claudeFile = (where: Where, id: string) =>
  transcriptFile(claudeTranscripts(where.home, where.env), id);

/** Claude Code's transcripts as its entry reads them (AGENTS, agents.ts). */
export const claudeTranscriptReader: Transcripts<'claude'> = {
  history: (where, since) => claudeHistory(claudeTranscripts(where.home, where.env), since),
  file: claudeFile,
  name: (where, id, file = claudeFile(where, id)) => (file ? claudeName(file) : undefined),
  firstPrompt: (file) => firstPromptIn(file, userText),
  messages: (file) => {
    const { lines, truncated } = tailLines(file, MESSAGE_TAIL);
    return { messages: lines.flatMap((line) => messageIn(line) ?? []), truncated };
  },
};
