import { statSync } from 'node:fs';
import { claudeTranscripts } from '../agents/claude/paths.js';
import { transcriptFile } from '../agents/claude/transcripts.js';
import { rolloutForThread } from '../agents/codex/rollouts.js';
import { clip } from '../lib/clip.js';
import { fileHead } from '../lib/file-head.js';
import type { Env } from '../lib/process.js';

// A native conversation's first prompt and when its file was last written: what a person
// recognises a conversation by when it has no native name (native-name.ts).

/** How far into a transcript or rollout the first prompt is looked for. */
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

type Block = { type?: unknown; text?: unknown };
type Line = {
  type?: unknown;
  isMeta?: unknown;
  message?: { role?: unknown; content?: unknown };
  payload?: { type?: unknown; role?: unknown; content?: unknown };
};

/** The person's text in a Claude Code transcript line or a Codex rollout line, if it is theirs. */
function userText(line: Line): unknown[] {
  if (line.type === 'user' && !line.isMeta && line.message?.role === 'user') {
    const content = line.message.content;
    return typeof content === 'string'
      ? [content]
      : Array.isArray(content)
        ? content.filter((b: Block) => b.type === 'text').map((b: Block) => b.text)
        : [];
  }
  const payload = line.payload;
  if (line.type === 'response_item' && payload?.type === 'message' && payload.role === 'user') {
    return Array.isArray(payload.content)
      ? payload.content.filter((b: Block) => b.type === 'input_text').map((b: Block) => b.text)
      : [];
  }
  return [];
}

function firstPrompt(head: string): string | undefined {
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
}

/**
 * Conversation `id`'s first prompt, one line of at most `PROMPT_CHARS`, and when its transcript or
 * rollout was last written; each none when it is not found. Antigravity keeps neither.
 */
export function nativePrompt(
  deps: { home: string; env: Env },
  c: { agent: string; id: string; file?: string },
): { prompt?: string; updatedAt?: string } {
  try {
    const file =
      c.file ??
      (c.agent === 'claude'
        ? transcriptFile(claudeTranscripts(deps.home, deps.env), c.id)
        : c.agent === 'codex'
          ? rolloutForThread(deps, c.id)
          : undefined);
    if (!file) return {};
    const updatedAt = statSync(file).mtime.toISOString();
    const prompt = firstPrompt(
      fileHead(file, PROMPT_HEAD, (head) => firstPrompt(head) !== undefined),
    );
    return { ...(prompt ? { prompt } : {}), updatedAt };
  } catch {
    // A file may disappear while it is read.
    return {};
  }
}
