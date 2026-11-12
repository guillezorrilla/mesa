// Whether the person is away from the Mac (#1016), as orca gates its phone pushes
// (docs/spikes/orca-comparison.md, Notifications): the Mac has sat idle for a while, or its
// screen is locked.
import { z } from 'zod';
import type { Runner } from '../lib/process.js';

/** When the paired phone gets a push: only while away, always, or never (`phone.push`). */
export const PHONE_PUSH_MODES = ['away', 'always', 'never'] as const;
export type PhonePushMode = (typeof PHONE_PUSH_MODES)[number];

/** How Settings names each mode. */
export const PHONE_PUSH_LABELS: Record<PhonePushMode, string> = {
  away: 'When away',
  always: 'Always',
  never: 'Never',
};

/**
 * The `phone` settings' fields without their defaults: the config adds those, and the phone's
 * `pushes` call sets any of them.
 */
export const PHONE_PUSH_FIELDS = {
  push: z.enum(PHONE_PUSH_MODES),
  /** Minutes the Mac must sit idle before `away` pushes. */
  awayAfter: z.number().int().min(1).max(240),
  /** Whether a finished turn pushes too; questions and permissions always do. */
  finished: z.boolean(),
};

const IOREG = '/usr/sbin/ioreg';

/** Seconds since the last keyboard or pointer input, from `ioreg -c IOHIDSystem`'s HIDIdleTime (ns). */
export function idleSeconds(ioreg: string): number | undefined {
  const nanos = ioreg.match(/"HIDIdleTime" = (\d+)/)?.[1];
  return nanos === undefined ? undefined : Number(nanos) / 1e9;
}

/** Whether `ioreg -n Root -d1` says the screen is locked: the console's flag, or its session's. */
export const screenLocked = (ioreg: string) =>
  /"(IOConsoleLocked" = Yes|CGSSessionScreenIsLocked"=Yes)/.test(ioreg);

/**
 * Whether the Mac has been idle `minutes` or its screen is locked. An ioreg that fails or says
 * nothing counts as at the desk, so a broken probe never pushes.
 */
export async function isAway(run: Runner, minutes: number): Promise<boolean> {
  const [hid, root] = await Promise.all([
    run(IOREG, ['-c', 'IOHIDSystem', '-d', '4'], 5_000),
    run(IOREG, ['-n', 'Root', '-d', '1'], 5_000),
  ]);
  if (root.ok && screenLocked(root.stdout)) return true;
  const idle = hid.ok ? idleSeconds(hid.stdout) : undefined;
  return idle !== undefined && idle >= minutes * 60;
}
