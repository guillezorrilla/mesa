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
  const strip = ({ session: _, yes: __, ...message }: Held): QueuedMessage => message;
  return {
    all,
    /** Session `id`'s messages, oldest first. */
    of: (id: string) =>
      all()
        .filter((held) => held.session === id)
        .map(strip),
    add: (session: string, text: string, yes: boolean) =>
      void change((held) => [
        ...held,
        { id: deps.newId(), session, text, yes, at: deps.clock().toISOString() },
      ]),
    remove: (id: string) => void change((held) => held.filter((m) => m.id !== id)),
    /** Keeps the message with why it could not be typed. */
    fail: (id: string, error: string) =>
      void change((held) => held.map((m) => (m.id === id ? { ...m, error } : m))),
  };
}
export type PhoneQueue = ReturnType<typeof phoneQueue>;
