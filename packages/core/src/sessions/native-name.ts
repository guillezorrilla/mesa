import { existsSync } from 'node:fs';
import { claudeTranscripts } from '../agents/claude/paths.js';
import { transcriptFile } from '../agents/claude/transcripts.js';
import { codexHome, codexSessionIndex } from '../agents/codex/paths.js';
import type { Agent } from '../agents/names.js';
import { lastMatchingLine } from '../lib/file-tail.js';
import type { Env } from '../lib/process.js';

// A native conversation's name, as its agent shows it (CONTEXT.md, Adopted session): the one
// owner. Read from the end of each file, which a long transcript reaches megabytes before.

type Title = { type?: unknown; customTitle?: unknown; aiTitle?: unknown };

/** A trimmed name, or none for a blank or missing one. */
const named = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

/**
 * A Claude Code transcript's name: the `customTitle` of its latest `custom-title` entry (the
 * person's), else the `aiTitle` of its latest `ai-title` entry. One pass from the end, which stops
 * at a custom title and reads the whole file only when it has none.
 */
function claudeName(file: string): string | undefined {
  let ai: string | undefined;
  const custom = lastMatchingLine(file, (line) => {
    // Cheap check first: most lines are messages and tool results.
    if (!line.includes('-title"')) return undefined;
    let entry: Title;
    try {
      entry = JSON.parse(line);
    } catch {
      return undefined;
    }
    if (entry.type === 'custom-title') return named(entry.customTitle);
    if (entry.type === 'ai-title') ai ??= named(entry.aiTitle);
    return undefined;
  });
  return custom ?? ai;
}

/** A Codex thread's name: the `thread_name` of the last line for its id in the session index. */
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

/**
 * Conversation `id`'s native name, none when it has none; Antigravity names none. `file` is its
 * Claude Code transcript when the caller has it already, else it is looked up.
 */
export function nativeName(
  deps: { home: string; env: Env },
  c: { agent: Agent; id: string; file?: string },
): string | undefined {
  try {
    if (c.agent === 'claude') {
      const file = c.file ?? transcriptFile(claudeTranscripts(deps.home), c.id);
      return file ? claudeName(file) : undefined;
    }
    if (c.agent === 'codex') {
      return codexName(codexSessionIndex(codexHome(deps.env, deps.home)), c.id);
    }
  } catch {
    // A file may disappear while it is read.
  }
  return undefined;
}

/** `{ name }` when conversation `c` has a native name, else nothing: spread into a row. */
export function withName(deps: { home: string; env: Env }, c: Parameters<typeof nativeName>[1]) {
  const name = nativeName(deps, c);
  return name ? { name } : {};
}
