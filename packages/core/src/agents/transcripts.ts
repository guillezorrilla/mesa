import { clip } from '../lib/clip.js';
import { fileHead } from '../lib/file-head.js';
import type { Env } from '../lib/process.js';
import type { Agent } from './names.js';

// What an agent's entry (AGENTS, agents.ts) reads from its native conversations on disk, and the
// pieces of that reading every agent's transcripts share. Each agent's own parsing is under
// agents/<agent>/.

/** Where an agent's files are: the home and environment it runs with. */
export type Where = { home: string; env: Env };

/** A native conversation on disk, with its transcript `file`. */
export type TranscriptRow<A extends Agent> = {
  agent: A;
  id: string;
  cwd: string;
  updatedAt: string;
  file: string;
};

/** One message in a transcript: who wrote it, its text, when, and the line that holds it. */
export type TranscriptMessage = {
  role: 'user' | 'assistant';
  text: string;
  at?: string;
  line: string;
};

/** An agent's readers of its native conversations. */
export type Transcripts<A extends Agent> = {
  /** Its conversations on disk; with `since` (epoch ms), only those last written then or later. */
  history: (where: Where, since?: number) => TranscriptRow<A>[];
  /** Conversation `id`'s transcript, none when it is not on disk. */
  file: (where: Where, id: string) => string | undefined;
  /** Its native name, none when it has none; `file` is its transcript when the caller has it. */
  name: (where: Where, id: string, file?: string) => string | undefined;
  /** The person's first prompt in transcript `file`, one line of at most `PROMPT_CHARS`. */
  firstPrompt: (file: string) => string | undefined;
  /** The messages in the end of `file` (MESSAGE_TAIL), oldest first, and whether it was cut. */
  messages: (file: string) => { messages: TranscriptMessage[]; truncated: boolean };
};

/** A content block of a message: its kind and, for text, its text. */
export type Block = { type?: unknown; text?: unknown };

/** A trimmed name, or none for a blank or missing one. */
export const named = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

/** How far into a transcript the first prompt is looked for. */
const PROMPT_HEAD = 1 << 20;
/** How long a first prompt may be once on one line. */
export const PROMPT_CHARS = 60;

// ponytail: text the agent injects as a user message, skipped by its opening; extend when an
// agent adds another kind (Claude Code's commands and caveats, Codex's context and history).
const INJECTED = ['<', 'Caveat:', '# AGENTS.md', 'The following is the Codex'];

/** `text` on one line and clipped, or none when blank or injected. */
function promptOf(text: unknown): string | undefined {
  if (typeof text !== 'string') return undefined;
  const line = text.replace(/\s+/g, ' ').trim();
  if (!line || INJECTED.some((start) => line.startsWith(start))) return undefined;
  return clip(line, PROMPT_CHARS);
}

/**
 * The first prompt in transcript `file`, read from its head only until one is found: the first
 * of the person's texts (`userText` finds them in one line) that is not blank or injected.
 */
export function firstPromptIn<Line>(
  file: string,
  userText: (line: Line) => unknown[],
): string | undefined {
  const first = (head: string) => {
    for (const raw of head.split('\n')) {
      let line: Line;
      try {
        line = JSON.parse(raw);
      } catch {
        continue; // A line cut at the end of the head.
      }
      for (const text of userText(line)) {
        const prompt = promptOf(text);
        if (prompt) return prompt;
      }
    }
    return undefined;
  };
  return first(fileHead(file, PROMPT_HEAD, (head) => first(head) !== undefined));
}

/** How much of a transcript's end its messages are read from. */
export const MESSAGE_TAIL = 2 << 20;

/** One transcript line parsed, or none when it is not a JSON object. */
export function parsedLine<Line extends object>(line: string): Line | undefined {
  let entry: unknown;
  try {
    entry = JSON.parse(line);
  } catch {
    return undefined;
  }
  return entry && typeof entry === 'object' ? (entry as Line) : undefined;
}

/**
 * The message `raw` that transcript `line` holds, written `at`: a user or assistant message
 * (`{ role, content }`) and its text, the content's string or its blocks' texts and tool
 * results' joined. None when it is not such a message or has no text.
 */
export function messageOf(raw: unknown, at: unknown, line: string): TranscriptMessage | undefined {
  const message =
    raw && typeof raw === 'object' ? (raw as { role?: unknown; content?: unknown }) : undefined;
  if (!message || (message.role !== 'user' && message.role !== 'assistant')) return undefined;
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
  return { role: message.role, text, ...(typeof at === 'string' ? { at } : {}), line };
}
