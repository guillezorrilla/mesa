import { AGENTS } from '../agents/agents.js';
import type { Agent } from '../agents/names.js';
import type { Env } from '../lib/process.js';

// A native conversation's name, as its agent shows it (CONTEXT.md, Adopted session): the one
// owner, through the agent's transcripts (agents/<agent>/transcripts.ts).

/**
 * Conversation `id`'s native name, none when it has none; Antigravity names none. `file` is its
 * Claude Code transcript when the caller has it already, else it is looked up.
 */
export function nativeName(
  deps: { home: string; env: Env },
  c: { agent: Agent; id: string; file?: string },
): string | undefined {
  try {
    return AGENTS[c.agent].transcripts?.name(deps, c.id, c.file);
  } catch {
    // A file may disappear while it is read.
    return undefined;
  }
}

/** `{ name }` when conversation `c` has a native name, else nothing: spread into a row. */
export function withName(deps: { home: string; env: Env }, c: Parameters<typeof nativeName>[1]) {
  const name = nativeName(deps, c);
  return name ? { name } : {};
}
