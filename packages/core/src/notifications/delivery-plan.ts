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
      target: Deliverable['target'] | { kind: 'inbox' };
    };

/** A notice native delivery may send: any but a release notice, which waits in the Inbox. */
type Deliverable = InboxItem & {
  kind: Exclude<InboxItem['kind'], 'release'>;
  target: Exclude<InboxItem['target'], { kind: 'release' }>;
};
const deliverable = (item: InboxItem): item is Deliverable => item.kind !== 'release';

/**
 * How long a finished turn's banner waits, so the app can first mark read the session it shows in
 * a focused window (CONTEXT.md, Unread). shortcut: a guess at two looks and a mark; raise it if a
 * watched session still banners.
 */
export const FINISHED_HOLD_MS = 5_000;

/**
 * What to deliver of `items` (newest first) not yet delivered and, except failed automation runs,
 * no older than `startedAt`: one notice, or a digest of up to 500, never counting a release
 * notice. `skipped` are the read ones, those whose kind is off, and finished turns of a session a
 * person had open since (`seenAt`), which the caller acknowledges so they are never offered again.
 * A finished turn under FINISHED_HOLD_MS old waits for a later plan.
 */
export function planDelivery(
  items: InboxItem[],
  settings: Config['notifications'],
  state: {
    startedAt: string;
    delivered: readonly string[];
    now: string;
    /** When a person last had the session open (its record's `seenAt`). */
    seenAt: (session: string) => string | undefined;
  },
): { plan: DeliveryPlan; skipped: string[] } {
  const fresh = items
    .filter(deliverable)
    .filter(
      (item) =>
        (item.kind === 'automation' || item.at >= state.startedAt) &&
        !state.delivered.includes(item.id),
    );
  const mode = (item: Deliverable) =>
    settings[item.kind === 'input-required' ? 'inputRequired' : item.kind];
  const seen = (item: Deliverable) =>
    item.kind === 'finished' && (state.seenAt(item.session) ?? '') >= item.at;
  const held = (item: Deliverable) =>
    item.kind === 'finished' && Date.parse(state.now) - Date.parse(item.at) < FINISHED_HOLD_MS;
  const skip = (item: Deliverable) => item.read || mode(item) === 'off' || seen(item);
  const skipped = fresh.filter(skip).map((item) => item.id);
  const pending = fresh.filter((item) => !skip(item) && !held(item)).slice(0, 500);
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
