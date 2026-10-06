import { existsSync } from 'node:fs';
import { lastMatchingLine, tailLines } from '../../lib/file-tail.js';
import {
  firstPromptIn,
  MESSAGE_TAIL,
  messageIn,
  named,
  type TranscriptEntry,
  type Transcripts,
} from '../transcripts.js';
import { codexHome, codexSessionIndex } from './paths.js';
import { codexHistory, rolloutForThread } from './rollouts.js';

// A Codex thread as a conversation: its rollout (rollouts.ts) read past the first line, and its
// name from the session index.

/** A thread's name: the `thread_name` of the last line for its id in the session index. */
function codexName(index: string, id: string): string | undefined {
  if (!existsSync(index)) return undefined;
  return (
    lastMatchingLine(index, (line) => {
      if (!line.includes(id)) return undefined;
      try {
        const entry = JSON.parse(line) as { id?: unknown; thread_name?: unknown };
        return entry.id === id ? (named(entry.thread_name) ?? '') : undefined;
      } catch {
        return undefined;
      }
    }) || undefined
  );
}

type Block = { type?: unknown; text?: unknown };

/** The person's text in one rollout line, if it is theirs. */
function userText(line: TranscriptEntry): unknown[] {
  const payload = line.payload;
  if (line.type !== 'response_item' || payload?.type !== 'message' || payload.role !== 'user')
    return [];
  return Array.isArray(payload.content)
    ? payload.content.filter((b: Block) => b.type === 'input_text').map((b: Block) => b.text)
    : [];
}

/** A response item's message. */
const pickMessage = (entry: TranscriptEntry) =>
  entry.type === 'response_item' &&
  entry.payload &&
  typeof entry.payload === 'object' &&
  'type' in entry.payload &&
  entry.payload.type === 'message'
    ? entry.payload
    : undefined;

function isTurnContext(line: string) {
  if (!line.includes('turn_context')) return false;
  try {
    return (JSON.parse(line) as { type?: unknown }).type === 'turn_context';
  } catch {
    return false;
  }
}

/** Codex's rollouts as its entry reads them (AGENTS, agents.ts). */
export const codexTranscriptReader: Transcripts<'codex'> = {
  history: codexHistory,
  file: rolloutForThread,
  name: (where, id) => codexName(codexSessionIndex(codexHome(where.home, where.env)), id),
  firstPrompt: (file) => firstPromptIn(file, userText),
  messages: (file) => {
    const { lines, truncated } = tailLines(file, MESSAGE_TAIL);
    // Codex's startup AGENTS and environment messages use role=user before turn_context.
    const firstTurn = lines.findIndex(isTurnContext);
    const messages = lines.flatMap((line, index) => {
      const message = messageIn(line, pickMessage);
      if (!message || (message.role === 'user' && (firstTurn < 0 || index < firstTurn))) return [];
      return [message];
    });
    return { messages, truncated };
  },
};
