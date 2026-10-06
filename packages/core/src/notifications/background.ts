import { isAbsolute } from 'node:path';
import { z } from 'zod';
import type { MesaContext } from '../context.js';
import { redactWhole } from '../lib/redact.js';
import type { DeliveryPlan } from './delivery-plan.js';

export type NotificationDelivery = {
  status: 'none' | 'unavailable' | 'denied' | 'delivered' | 'failed';
  detail?: string;
  ids?: string[];
};

/** Runs the bundled app's notification-only entrypoint without opening the desktop. */
export async function backgroundDelivery(
  ctx: MesaContext,
  notices: { delivery: () => DeliveryPlan; claimDelivery: () => DeliveryPlan },
): Promise<NotificationDelivery> {
  try {
    if (notices.delivery().kind === 'none') return { status: 'none' };
    const helper = ctx.env.MESA_NOTIFICATION_HELPER;
    if (!helper || !isAbsolute(helper))
      return {
        status: 'unavailable',
        detail:
          'Install from bundled Mesa, or set MESA_NOTIFICATION_HELPER to its absolute Contents/MacOS executable. The notice is in the Inbox.',
      };
    const status = await ctx.run(helper, ['--mesa-notification', 'status'], 10_000);
    if (!status.ok)
      return {
        status: 'unavailable',
        detail: redactWhole(status.detail, ctx.home, ctx.secrets()),
      };
    const permission = z.object({ authorization: z.string() }).parse(JSON.parse(status.stdout));
    if (!['authorized', 'provisional', 'ephemeral'].includes(permission.authorization))
      return {
        status: 'denied',
        detail: 'Enable notifications in bundled Mesa. The notice is in the Inbox.',
      };
    const plan = notices.claimDelivery();
    if (plan.kind === 'none') return { status: 'none' };
    // At most one attempt, as in the desktop: an OS failure loses only the banner, never the inbox.
    const sent = await ctx.run(helper, ['--mesa-notification', 'send'], 10_000, {
      input: JSON.stringify({ profile: ctx.profile, ...plan }),
    });
    return sent.ok
      ? { status: 'delivered', ids: plan.ids }
      : {
          status: 'failed',
          detail: redactWhole(sent.detail, ctx.home, ctx.secrets()),
          ids: plan.ids,
        };
  } catch (error) {
    return {
      status: 'failed',
      detail: redactWhole(
        error instanceof Error ? error.message : String(error),
        ctx.home,
        ctx.secrets(),
      ),
    };
  }
}
