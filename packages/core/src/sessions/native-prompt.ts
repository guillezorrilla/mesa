import { statSync } from 'node:fs';
import { AGENTS } from '../agents/agents.js';
import type { Agent } from '../agents/names.js';
import type { Env } from '../lib/process.js';

// A native conversation's first prompt and when its file was last written: what a person
// recognises a conversation by when it has no native name (native-name.ts).

/**
 * Conversation `id`'s first prompt, one line of at most `PROMPT_CHARS` (agents/transcripts.ts),
 * and when its transcript or rollout was last written; each none when it is not found.
 * Antigravity keeps neither.
 */
export function nativePrompt(
  deps: { home: string; env: Env },
  c: { agent: Agent; id: string; file?: string },
): { prompt?: string; updatedAt?: string } {
  const transcripts = AGENTS[c.agent].transcripts;
  if (!transcripts) return {};
  try {
    const file = c.file ?? transcripts.file(deps, c.id);
    if (!file) return {};
    const updatedAt = statSync(file).mtime.toISOString();
    const prompt = transcripts.firstPrompt(file);
    return { ...(prompt ? { prompt } : {}), updatedAt };
  } catch {
    // A file may disappear while it is read.
    return {};
  }
}
