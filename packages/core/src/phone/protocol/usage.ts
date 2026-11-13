// What the phone asks about usage (#1067): estimated cost today, this week and this month, per
// day, per session with its context use, and the cost alerts reached. rpc.ts adds the call.
import { z } from 'zod';

/** An estimated cost in US dollars, of what is priced; null when nothing in it is. */
const cost = z.number().nullable();

/** One session on the board: its estimated cost so far and how full its context window is. */
export const phoneSessionUsage = z.object({
  id: z.string(),
  title: z.string(),
  project: z.string().nullable(),
  cost,
  context: z.number().nullable(),
});
export type PhoneSessionUsage = z.infer<typeof phoneSessionUsage>;

export const phoneUsage = z.object({
  today: cost,
  week: cost,
  month: cost,
  /**
   * How many sessions each period's cost leaves out (core's UsageTotals `excluded`). An older Mac
   * sends none, and its periods are null while any is.
   */
  excluded: z
    .object({ today: z.number(), week: z.number(), month: z.number() })
    .default({ today: 0, week: 0, month: 0 }),
  /** The last 14 local days, oldest first, each `YYYY-MM-DD`. */
  days: z.array(z.object({ day: z.string(), cost })),
  /** Costliest first. */
  sessions: z.array(phoneSessionUsage),
  /** Each reached cost alert as it reads on the Mac (core's costAlertText). */
  alerts: z.array(z.string()),
});
export type PhoneUsage = z.infer<typeof phoneUsage>;

/** The usage call, which rpc.ts adds to phoneCall. */
export const usageCalls = [z.object({ method: z.literal('usage') })] as const;

/** Its result, which rpc.ts adds to callResults. */
export const usageResults = { usage: phoneUsage };
