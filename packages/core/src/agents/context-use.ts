import { z } from 'zod';

/**
 * How much of its context window a session has used (CONTEXT.md, Context use): `used` in percent
 * of `window` tokens, as of its agent's reply at `at`. Each agent reads it its own way
 * (claude/context-use.ts, codex/context-use.ts); a session record keeps the last reading.
 */
export const ContextUseSchema = z.strictObject({
  used: z.number().min(0),
  window: z.number().int().positive(),
  at: z.iso.datetime({ offset: true }),
  source: z.literal('transcript'),
  /** The model that produced this reading, when the native transcript names it. */
  model: z.string().optional(),
  /** The native per-turn reasoning effort, when recorded with this reading. */
  effort: z.string().optional(),
});
export type ContextUse = z.infer<typeof ContextUseSchema>;
