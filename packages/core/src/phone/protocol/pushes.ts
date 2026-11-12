// Which pushes the phone gets (#1067): the profile's `phone` settings (#1016), read and changed
// from the phone. rpc.ts adds the call.
import { z } from 'zod';
import { PHONE_PUSH_MODES } from '../away.js';

export const phonePushes = z.object({
  /** When: only while away from the Mac, always, or never. */
  push: z.enum(PHONE_PUSH_MODES),
  /** Minutes the Mac sits idle before the person counts as away. */
  awayAfter: z.number().int().min(1).max(240),
  /** Whether a finished turn pushes too, beside questions, permissions and approvals. */
  finished: z.boolean(),
});
export type PhonePushes = z.infer<typeof phonePushes>;

/** Reads the settings, after changing the ones in `set`. */
export const pushesCalls = [
  z.object({ method: z.literal('pushes'), set: phonePushes.partial().optional() }),
] as const;

export const pushesResults = { pushes: phonePushes };
