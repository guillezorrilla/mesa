import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { claudeTranscripts } from '../agents/claude/paths.js';
import { transcriptFile } from '../agents/claude/transcripts.js';
import { rolloutForThread } from '../agents/codex/rollouts.js';
import { MesaError } from '../lib/result.js';
import { type NativeHistoryDeps, nativeHistory } from './history.js';

const FILES = 100;
const BYTES = 2 << 20;
const HITS = 30;

export type ConversationHit = {
  agent: 'claude' | 'codex';
  id: string;
  cwd: string;
  role: 'user' | 'assistant';
  at?: string;
  excerpt: string;
};
export type ConversationSearch = {
  hits: ConversationHit[];
  filesSearched: number;
  truncated: boolean;
  unsupported: { agent: 'antigravity'; reason: string }[];
};

/** Local native text search: at most 100 recent conversations, 2 MiB tail each, 30 hits. */
export function searchConversations(
  deps: NativeHistoryDeps,
  project: string,
  query: string,
): ConversationSearch {
  const needle = query.trim();
  if (needle.length < 2 || needle.length > 200 || needle.includes('\0')) {
    throw new MesaError('usage', 'conversation search needs 2-200 characters');
  }
  const lower = needle.toLowerCase();
  const history = nativeHistory(deps, project);
  const hits: ConversationHit[] = [];
  let filesSearched = 0;
  let truncated = history.total > FILES;
  for (const row of history.rows.slice(0, FILES)) {
    const file =
      row.agent === 'claude'
        ? transcriptFile(claudeTranscripts(deps.home), row.id)
        : rolloutForThread({ home: deps.home, env: deps.env }, row.id);
    if (!file) continue;
    let lines: string[];
    try {
      const read = tailLines(file);
      lines = read.lines;
      truncated ||= read.truncated;
    } catch {
      continue;
    }
    filesSearched++;
    // Codex's startup AGENTS and environment messages use role=user before turn_context.
    const firstTurn = row.agent === 'codex' ? lines.findIndex(isTurnContext) : 0;
    for (let indexOfLine = lines.length - 1; indexOfLine >= 0; indexOfLine--) {
      const line = lines[indexOfLine];
      if (!line) continue;
      const message = messageIn(row.agent, line);
      if (!message) continue;
      if (
        row.agent === 'codex' &&
        message.role === 'user' &&
        (firstTurn < 0 || indexOfLine < firstTurn)
      )
        continue;
      const index = message.text.toLowerCase().indexOf(lower);
      if (index < 0) continue;
      const start = Math.max(0, index - 70);
      const end = Math.min(message.text.length, index + needle.length + 110);
      hits.push({
        agent: row.agent,
        id: row.id,
        cwd: row.cwd,
        role: message.role as 'user' | 'assistant',
        ...(message.at ? { at: message.at } : {}),
        excerpt: `${start ? '…' : ''}${message.text.slice(start, end).replace(/\s+/g, ' ')}${end < message.text.length ? '…' : ''}`,
      });
      if (hits.length === HITS)
        return { hits, filesSearched, truncated: true, unsupported: history.unsupported };
    }
  }
  return { hits, filesSearched, truncated, unsupported: history.unsupported };
}

function isTurnContext(line: string) {
  if (!line.includes('turn_context')) return false;
  try {
    return (JSON.parse(line) as { type?: unknown }).type === 'turn_context';
  } catch {
    return false;
  }
}

/** Bounded native transcript text; a partial first line is never parsed. */
export function tailLines(file: string): { lines: string[]; truncated: boolean } {
  const fd = openSync(file, 'r');
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - BYTES);
    const bytes = Buffer.alloc(size - start);
    const read = readSync(fd, bytes, 0, bytes.length, start);
    const text = bytes.subarray(0, read).toString('utf8');
    const lines = text.split('\n');
    if (start) lines.shift();
    return { lines, truncated: start > 0 };
  } finally {
    closeSync(fd);
  }
}

/** Text from one native message, excluding sidechains and non-message records. */
export function messageIn(agent: 'claude' | 'codex', line: string) {
  let entry: {
    type?: unknown;
    isSidechain?: unknown;
    timestamp?: unknown;
    message?: unknown;
    payload?: unknown;
  };
  try {
    entry = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!entry || typeof entry !== 'object') return undefined;
  const raw =
    agent === 'claude'
      ? entry?.type === 'user' || entry?.type === 'assistant'
        ? entry.message
        : undefined
      : entry?.type === 'response_item' &&
          entry.payload &&
          typeof entry.payload === 'object' &&
          'type' in entry.payload &&
          entry.payload.type === 'message'
        ? entry.payload
        : undefined;
  const message =
    raw && typeof raw === 'object' ? (raw as { role?: unknown; content?: unknown }) : undefined;
  if (
    !message ||
    entry.isSidechain === true ||
    (message.role !== 'user' && message.role !== 'assistant')
  )
    return undefined;
  const parts =
    typeof message.content === 'string'
      ? [message.content]
      : Array.isArray(message.content)
        ? (message.content as unknown[]).map((part) => {
            if (!part || typeof part !== 'object') return undefined;
            const value = part as { text?: unknown; type?: unknown; content?: unknown };
            return typeof value.text === 'string'
              ? value.text
              : value.type === 'tool_result' && typeof value.content === 'string'
                ? value.content
                : undefined;
          })
        : [];
  const text = parts.filter((part: unknown): part is string => typeof part === 'string').join('\n');
  if (!text) return undefined;
  return {
    role: message.role,
    text,
    at: typeof entry.timestamp === 'string' ? entry.timestamp : undefined,
  };
}
