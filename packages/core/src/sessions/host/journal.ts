import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// A Structured session's journal (ADR-0029): every line its agent printed and every message Mesa
// sent it, in order, one JSON object per line, append-only. `mesa logs` reads it; a chat can be
// folded again from it (sessions/native/stream-chat.ts).

/** One journal line: an event as claude printed it, or what Mesa sent. */
export type JournalEntry =
  | { at: string; event: unknown }
  | { at: string; sent: Record<string, unknown> };

export const journalFile = (dir: string, id: string) => join(dir, `${id}.jsonl`);

/** Appends `entry` to session `id`'s journal under `dir`, making the folder first. */
export function appendJournal(dir: string, id: string, entry: JournalEntry) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  appendFileSync(journalFile(dir, id), `${JSON.stringify(entry)}\n`, { mode: 0o600 });
}

/** The journal's lines, its last `tail` when given; none when it has no journal. */
export function readJournal(dir: string, id: string, tail?: number): string[] | undefined {
  const file = journalFile(dir, id);
  if (!existsSync(file)) return undefined;
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  return tail === undefined ? lines : lines.slice(Math.max(0, lines.length - tail));
}
