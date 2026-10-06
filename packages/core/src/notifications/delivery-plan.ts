import { createHash } from 'node:crypto';
import type { Config } from '../profile/config.js';
import type { InboxItem } from './inbox-items.js';

export type DeliveryPlan =
  | { kind: 'none' }
  | {
      kind: 'notice' | 'digest';
      id: string;
      ids: string[];
      title: string;
      body: string;
      sound: boolean;
      target: InboxItem['target'] | { kind: 'inbox' };
    };

/**
 * What to deliver of `items` (newest first) not yet delivered and, except failed automation runs,
 * no older than `startedAt`: one notice, or a digest of up to 500. `skipped` are the read ones
 * and those whose kind is off, which the caller acknowledges so they are never offered again.
 */
export function planDelivery(
  items: InboxItem[],
  settings: Config['notifications'],
  state: { startedAt: string; delivered: readonly string[] },
): { plan: DeliveryPlan; skipped: string[] } {
  const fresh = items.filter(
    (item) =>
      (item.kind === 'automation' || item.at >= state.startedAt) &&
      !state.delivered.includes(item.id),
  );
  const mode = (item: InboxItem) =>
    settings[item.kind === 'input-required' ? 'inputRequired' : item.kind];
  const skipped = fresh.filter((item) => item.read || mode(item) === 'off').map((item) => item.id);
  const pending = fresh.filter((item) => !item.read && mode(item) !== 'off').slice(0, 500);
  if (settings.quiet || pending.length === 0) return { plan: { kind: 'none' }, skipped };
  const ids = pending.map((item) => item.id);
  const item = pending[0];
  if (item && pending.length === 1) {
    return {
      plan: {
        kind: 'notice',
        id: item.id,
        ids,
        title: item.title,
        body:
          item.kind === 'doctor'
            ? 'Open Doctor to review and fix'
            : item.kind === 'automation'
              ? Array.from(item.detail ?? 'Open Automations to review')
                  .slice(0, 300)
                  .join('')
              : `Session ${item.session}`,
        sound: mode(item) === 'sound',
        target: item.target,
      },
      skipped,
    };
  }
  return {
    plan: {
      kind: 'digest',
      id: `digest-${createHash('sha256').update(ids.join('\n')).digest('hex').slice(0, 20)}`,
      ids,
      title: `${ids.length} Mesa notices`,
      body: 'Open Inbox to review your sessions',
      sound: pending.some((item) => mode(item) === 'sound'),
      target: { kind: 'inbox' },
    },
    skipped,
  };
}
