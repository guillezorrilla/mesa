import { appendFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Clock } from '../lib/clock.js';
import { scanLines } from '../lib/file-lines.js';
import type { IdSource } from '../lib/ids.js';
import { EVALUATION_STATUSES } from './evaluate.js';
import { SYSTEM_ONE_PROVIDERS } from './systemone.js';

// The Decision log (CONTEXT.md, ADR-0024): every model ask at the supervision and relevance sites,
// and every guardrail stop, one JSON line each in the profile's `decision-log/<YYYY-MM>.jsonl`.
// Impact reads it; nothing decides from it. Profile data, never the vault: a busy Board asks a
// model many times a minute, too many for receipts. It never holds a prompt or a screen.

const LOG_SITES = ['supervision', 'relevance', 'guardrail'] as const;

/**
 * How the entry went. A model ask is accepted, abstained, unavailable (failed, or not asked), or
 * skipped (relevance: no source shared enough words, so no model was asked). A guardrail stop is
 * blocked (it did not go on) or overridden (`--yes`, a person's yes, or `--force`).
 */
const LOG_STATUSES = [...EVALUATION_STATUSES, 'skipped', 'blocked', 'overridden'] as const;

const EntrySchema = z.object({
  id: z.string(),
  at: z.iso.datetime(),
  site: z.enum(LOG_SITES),
  session: z.string().nullable(),
  project: z.string().nullable(),
  /** What was decided, in plain words; never the prompt or the screen. */
  question: z.string(),
  /** What the rules alone answer, when they answer this site at all. */
  rules: z.string().nullable(),
  answer: z.string().nullable(),
  by: z.enum(['rules', ...SYSTEM_ONE_PROVIDERS]),
  status: z.enum(LOG_STATUSES),
  /** Mesa changed something: an accepted answer the rules did not give, advice sent, a stop. */
  changed: z.boolean(),
  margin: z.number().optional(),
  probabilities: z.record(z.string(), z.number()).optional(),
  latencyMs: z.number().optional(),
  /** The vault note advice named, relative to the vault. */
  note: z.string().optional(),
  /** Why the guardrail stopped, in words. */
  reason: z.string().optional(),
  override: z.enum(['yes', 'confirmed', 'force']).optional(),
});
export type LogEntry = z.infer<typeof EntrySchema>;
export type NewLogEntry = Omit<LogEntry, 'id' | 'at'>;

export type LogFilter = { since?: Date; session?: string; project?: string };

/** One month's file: `<YYYY-MM>.jsonl`. */
const MONTH = /^\d{4}-\d{2}\.jsonl$/;

function parse(line: string): LogEntry | undefined {
  try {
    const entry = EntrySchema.safeParse(JSON.parse(line));
    return entry.success ? entry.data : undefined;
  } catch {
    return undefined;
  }
}

/** The profile's Decision log in `dir`. */
export function decisionLog(deps: { dir: string; clock: Clock; newId: IdSource }) {
  return {
    /** Appends one entry. Best effort: a log that cannot be written never fails the decision. */
    append: (entry: NewLogEntry): void => {
      try {
        const at = deps.clock().toISOString();
        mkdirSync(deps.dir, { recursive: true, mode: 0o700 });
        // ponytail: one O_APPEND write per line, no lock, as the hook event logs; a line stays
        // whole under concurrent mesa processes while it is shorter than the pipe buffer.
        appendFileSync(
          join(deps.dir, `${at.slice(0, 7)}.jsonl`),
          `${JSON.stringify({ id: deps.newId(), at, ...entry })}\n`,
          { mode: 0o600 },
        );
      } catch {
        // The decision stands without its line.
      }
    },
    /** The entries matching `filter`, newest first; a line that does not parse is skipped. */
    read: (filter: LogFilter = {}): LogEntry[] => {
      if (!existsSync(deps.dir)) return [];
      const from = filter.since?.toISOString();
      const months = readdirSync(deps.dir).filter(
        (name) => MONTH.test(name) && (!from || name.slice(0, 7) >= from.slice(0, 7)),
      );
      const entries: LogEntry[] = [];
      for (const name of months) {
        scanLines(join(deps.dir, name), 0, (line) => {
          const entry = parse(line);
          if (
            entry &&
            (!from || entry.at >= from) &&
            (!filter.session || entry.session === filter.session) &&
            (!filter.project || entry.project === filter.project)
          )
            entries.push(entry);
        });
      }
      // Later lines first, so entries of the same instant read newest first too.
      return entries.reverse().sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    },
  };
}

export type DecisionLog = ReturnType<typeof decisionLog>;
