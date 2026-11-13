// What the agent did between its replies (#1143), as the session screen's rows: its tool calls,
// file edits and reasoning (agents/steps.ts), each a line the detail carries, and the call that
// reads one step's whole text when its row is opened. rpc.ts joins these to the other calls.
import { z } from 'zod';

const placed = {
  id: z.string(),
  /** How many of the detail's agent replies are newer, which places it among them. */
  newer: z.number().int().nonnegative(),
};

/**
 * One step as a row: a tool call's kind (read, search, list, command, web, agent, plan, other),
 * tool name, one-line target and status (running, done, failed); an edit's path and counts; a
 * thought's first line. Kinds and statuses are strings, so a newer Mac's reach an older app.
 */
export const phoneStep = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tool'),
    ...placed,
    kind: z.string(),
    name: z.string(),
    target: z.string(),
    status: z.string(),
  }),
  z.object({
    type: z.literal('edit'),
    ...placed,
    path: z.string(),
    added: z.number().int().nonnegative(),
    removed: z.number().int().nonnegative(),
    status: z.string(),
  }),
  z.object({ type: z.literal('thought'), ...placed, line: z.string() }),
]);
export type PhoneStep = z.infer<typeof phoneStep>;

export const stepCalls = [
  /** One step's whole text: a tool's output, an edit's hunk lines, a thought. */
  z.object({ method: z.literal('step'), id: z.string(), step: z.string() }),
] as const;

export const stepResults = {
  step: z.object({ text: z.string() }),
};
