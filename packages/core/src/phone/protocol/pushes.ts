// Which pushes the phone gets (#1067): the profile's `phone` settings (#1016), read and changed
// from the phone. rpc.ts adds the call.
import { z } from 'zod';
import { PHONE_PUSH_FIELDS } from '../away.js';

export const phonePushes = z.object(PHONE_PUSH_FIELDS);
export type PhonePushes = z.infer<typeof phonePushes>;

/** Reads the settings, after changing the ones in `set`. */
export const pushesCalls = [
  z.object({ method: z.literal('pushes'), set: phonePushes.partial().optional() }),
] as const;

export const pushesResults = { pushes: phonePushes };
