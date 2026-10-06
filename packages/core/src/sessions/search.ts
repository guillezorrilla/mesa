import { AGENTS } from '../agents/agents.js';
import type { TranscriptMessage } from '../agents/transcripts.js';
import { MesaError } from '../lib/result.js';
import { type NativeHistoryDeps, nativeHistory } from './history.js';

const FILES = 100;
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
    const transcripts = AGENTS[row.agent].transcripts;
    const file = transcripts.file(deps, row.id);
    if (!file) continue;
    let messages: TranscriptMessage[];
    try {
      const read = transcripts.messages(file);
      messages = read.messages;
      truncated ||= read.truncated;
    } catch {
      continue;
    }
    filesSearched++;
    for (const message of [...messages].reverse()) {
      const index = message.text.toLowerCase().indexOf(lower);
      if (index < 0) continue;
      const start = Math.max(0, index - 70);
      const end = Math.min(message.text.length, index + needle.length + 110);
      hits.push({
        agent: row.agent,
        id: row.id,
        cwd: row.cwd,
        role: message.role,
        ...(message.at ? { at: message.at } : {}),
        excerpt: `${start ? '…' : ''}${message.text.slice(start, end).replace(/\s+/g, ' ')}${end < message.text.length ? '…' : ''}`,
      });
      if (hits.length === HITS)
        return { hits, filesSearched, truncated: true, unsupported: history.unsupported };
    }
  }
  return { hits, filesSearched, truncated, unsupported: history.unsupported };
}
