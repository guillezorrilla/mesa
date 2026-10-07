import { z } from 'zod';
import { AGENT_STATES } from '../../agents/states.js';
import { SYSTEM_ONE_PROVIDERS, type SystemOneProvider } from '../../decisions/systemone.js';
import { changeJson, readJson } from '../../lib/json-file.js';
import type { LockDeps } from '../../lib/lock-file.js';
import type { SessionRecord } from '../record/record.js';

// What the Board wants a decision model to place, and the replies (#461): one entry per unsure
// session in the profile's placements.json, shared by the looks that write what they want and the
// call beside them that asks.

/** At most this many asks per session in any hour, whatever the screen does. */
export const ASKS_PER_HOUR = 60;
const HOUR_MS = 3_600_000;

/** What one ask came to, as a row shows it: the model id asked, and how its answer went. */
const AskSchema = z.strictObject({
  /** The model id asked (`jev-1.13.0`, `clef`). */
  model: z.string(),
  margin: z.number().min(0).max(1).optional(),
  latencyMs: z.number().nonnegative().optional(),
  inputTokens: z.number().nonnegative().optional(),
  /** Why the rules' state stands: the model abstained, failed, or was not asked. */
  fallbackReason: z.string().optional(),
});

/** One reply for one key: the state the model placed, if its answer was accepted, and the ask. */
const ReplySchema = z.strictObject({
  key: z.string(),
  at: z.iso.datetime(),
  placed: z
    .strictObject({
      state: z.enum(AGENT_STATES),
      /** The model's probability for that state. */
      confidence: z.number().min(0).max(1),
      source: z.enum(SYSTEM_ONE_PROVIDERS),
    })
    .optional(),
  /** The model's probability per state, kept with the reply whether it was accepted or not. */
  probabilities: z.record(z.string(), z.number().min(0).max(1)).optional(),
  ask: AskSchema,
});
export type PlacementReply = z.infer<typeof ReplySchema>;

/** What a look wants placed: the cache key, and the bounded state text the model reads. */
const WantSchema = z.strictObject({ key: z.string(), state: z.string() });
export type Want = z.infer<typeof WantSchema>;

const EntrySchema = z.strictObject({
  want: WantSchema.optional(),
  /** The ask in flight, from when it was claimed. */
  pending: z.strictObject({ key: z.string(), since: z.iso.datetime() }).optional(),
  reply: ReplySchema.optional(),
  /** When each ask of the last hour was claimed, for ASKS_PER_HOUR. */
  asks: z.array(z.iso.datetime()),
});
type Entry = z.infer<typeof EntrySchema>;

const PlacementsSchema = z.record(z.string(), EntrySchema).describe('placements');
type Placements = z.infer<typeof PlacementsSchema>;

/**
 * An ask to make: the session, the key it answers, and the state to send; or, past the budget,
 * the reply saved instead of asking.
 */
export type Claim = { id: string; key: string; state: string; refused?: PlacementReply };

/**
 * How a row was placed, for `mesa show --json` and the app: `rules`, or the model whose answer
 * stands, with the model's reply for this screen; `pending` while an ask is wanted.
 */
export type Supervision = Partial<z.infer<typeof AskSchema>> & {
  source: 'rules' | SystemOneProvider;
  pending?: true;
};

/** Its row's Supervision from the state it shows and the reply for its screen now, if any. */
export function supervisionOf(
  lastState: SessionRecord['lastState'],
  reply: PlacementReply | undefined,
  pending: boolean,
): Supervision {
  const source =
    lastState.source === 'jev' || lastState.source === 'clef' ? lastState.source : 'rules';
  return { source, ...reply?.ask, ...(pending ? { pending: true as const } : {}) };
}

const recent = (asks: readonly string[], now: Date) =>
  asks.filter((at) => now.getTime() - Date.parse(at) < HOUR_MS);

/** An entry that holds nothing a look or the budget needs is dropped. */
const kept = (entry: Entry, now: Date): Entry | undefined => {
  const asks = recent(entry.asks, now);
  return entry.want || entry.pending || asks.length ? { ...entry, asks } : undefined;
};

/**
 * The profile's placements file. Every change is made under its lock, so two mesa processes
 * never both claim one key.
 */
export function placementStore(file: string, lock: LockDeps) {
  const change = (fn: (all: Placements) => Placements) =>
    changeJson(file, PlacementsSchema, (current) => fn({ ...current }), lock, { tries: 20 });
  return {
    /**
     * A look of session `id`: records what it wants placed (`want`), or that it wants nothing,
     * and returns the reply for that key once one is saved. Read without the lock when nothing
     * changes; a locked or unreadable file leaves this look with the rules alone.
     */
    look: (id: string, want: Want | undefined): PlacementReply | undefined => {
      try {
        const entry = readJson(file, PlacementsSchema)?.[id];
        const ready = want && entry?.reply?.key === want.key ? entry.reply : undefined;
        if (entry?.want?.key === want?.key) return ready;
        change((all) => {
          const current = all[id] ?? { asks: [] };
          const next = kept(
            want
              ? { ...current, want }
              : { asks: current.asks, ...(current.pending ? { pending: current.pending } : {}) },
            lock.clock(),
          );
          if (next) all[id] = next;
          else delete all[id];
          return all;
        });
        return ready;
      } catch {
        return undefined;
      }
    },
    /**
     * Claims every wanted key with no reply and no ask in flight (one older than `abandonMs` was
     * abandoned by a mesa that died), counting it against the hour's asks. A session at
     * ASKS_PER_HOUR gets a budget reply for that key instead (`refused`), and is not asked.
     */
    claim: (model: string, abandonMs: number): Claim[] => {
      const now = lock.clock();
      const claims: Claim[] = [];
      change((all) => {
        for (const [id, entry] of Object.entries(all)) {
          const { want, pending, ...rest } = entry;
          const live =
            pending && now.getTime() - Date.parse(pending.since) < abandonMs ? pending : undefined;
          const asks = recent(entry.asks, now);
          const settled = { ...rest, ...(want ? { want } : {}), asks };
          let next: Entry = live ? { ...settled, pending: live } : settled;
          if (want && !live && entry.reply?.key !== want.key) {
            const at = now.toISOString();
            if (asks.length >= ASKS_PER_HOUR) {
              const fallbackReason = `budget reached: ${ASKS_PER_HOUR} asks in the last hour`;
              const reply = { key: want.key, at, ask: { model, fallbackReason } };
              claims.push({ id, key: want.key, state: want.state, refused: reply });
              next = { ...settled, reply };
            } else {
              claims.push({ id, key: want.key, state: want.state });
              next = { ...settled, pending: { key: want.key, since: at }, asks: [...asks, at] };
            }
          }
          const left = kept(next, now);
          if (left) all[id] = left;
          else delete all[id];
        }
        return all;
      });
      return claims;
    },
    /**
     * Ends the ask for `key`: saves `reply` while a look still wants that key, else drops it as
     * stale (the screen changed). Returns whether it was saved.
     */
    settle: (id: string, key: string, reply: PlacementReply | undefined): boolean => {
      let saved = false;
      change((all) => {
        const entry = all[id];
        if (!entry) return all;
        const { pending, ...rest } = entry;
        const mine = pending?.key === key ? rest : entry;
        saved = reply !== undefined && entry.want?.key === key;
        all[id] = saved ? { ...mine, reply } : mine;
        return all;
      });
      return saved;
    },
  };
}

export type PlacementStore = ReturnType<typeof placementStore>;
