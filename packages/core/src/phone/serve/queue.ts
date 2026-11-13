import { z } from 'zod';
import { changeJson, readJson } from '../../lib/json-file.js';
import type { LockDeps } from '../../lib/lock-file.js';
import { type QueuedMessage, queuedMessage } from '../protocol/steer.js';

// The phone's replies to busy sessions, held in the profile until each turn ends (CONTEXT.md,
// Queued message); deliver.ts types them.

const QueueSchema = z
  .array(
    queuedMessage.extend({
      session: z.string(),
      /** The person said Send anyway to the guardrail's ask, so its delivery sends past one. */
      yes: z.boolean().default(false),
    }),
  )
  .describe('phone queue');
type Held = z.infer<typeof QueueSchema>[number];

/** A queued message as `mesa queue list` prints it: its session, and who queued it. */
export type QueuedEntry = QueuedMessage & { session: string; from: 'phone' };

/** The queue file (`phone-queue.json` in the profile), changed under its lock. */
export function phoneQueue(deps: {
  file: string;
  lock: LockDeps;
  clock: () => Date;
  newId: () => string;
}) {
  const all = () => readJson(deps.file, QueueSchema) ?? [];
  // An empty queue removes its file.
  const change = (next: (held: Held[]) => Held[]) =>
    changeJson(
      deps.file,
      QueueSchema,
      (held = []) => {
        const kept = next(held);
        return kept.length ? kept : undefined;
      },
      deps.lock,
    );
  /** Every queued message, or session `id`'s, oldest first, as the Mac lists them. */
  const list = (id?: string): QueuedEntry[] =>
    all()
      .filter((held) => id === undefined || held.session === id)
      .map(({ yes: _, ...held }) => ({ ...held, from: 'phone' as const }));
  return {
    all,
    list,
    /** Session `id`'s messages, oldest first, as the phone shows them. */
    of: (id: string): QueuedMessage[] => list(id).map(({ session: _, from: __, ...m }) => m),
    add: (session: string, text: string, yes: boolean) =>
      void change((held) => [
        ...held,
        { id: deps.newId(), session, text, yes, at: deps.clock().toISOString() },
      ]),
    /** Removes message `id`; false when it was no longer queued (typed, or removed already). */
    remove: (id: string) => {
      let found = false;
      change((held) => {
        found = held.some((m) => m.id === id);
        return held.filter((m) => m.id !== id);
      });
      return found;
    },
    /** Keeps the message with why it could not be typed. */
    fail: (id: string, error: string) =>
      void change((held) => held.map((m) => (m.id === id ? { ...m, error } : m))),
  };
}
export type PhoneQueue = ReturnType<typeof phoneQueue>;
