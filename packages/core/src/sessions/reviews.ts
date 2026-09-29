import type { Overrides } from '../decisions/guardrail.js';
import type { Clock } from '../lib/clock.js';
import { MesaError } from '../lib/result.js';
import type { Recorded } from '../receipts/recorder.js';
import type { SessionRecord } from './record.js';
import type { Sent } from './send.js';
import type { SessionStore } from './store.js';

export type SavedReview = Extract<SessionRecord['events'][number], { type: 'review' }>;
export type ReviewPreview = {
  id: string;
  target: string;
  source: string;
  revision: string;
  passage: string;
  comment: string;
  prompt: string;
  path?: string;
  base?: string;
  staged?: boolean;
};
export type ReviewDelivery = {
  id: string;
  target: string;
  status: 'delivered' | 'uncertain';
  already?: boolean;
  sent?: Sent;
  receipt?: Recorded<Sent>['receipt'];
  warning?: string;
  reason?: string;
};

type DeliveryDeps = {
  store: SessionStore;
  clock: Clock;
  send: (
    id: string,
    prompt: string,
    opts: Overrides & { noFrom?: boolean },
  ) => Promise<Recorded<Sent>>;
};

/** One delivery owner for response and code feedback; a pending send is never retried blindly. */
export async function sendReview(
  deps: DeliveryDeps,
  id: string,
  kind: 'response' | 'change',
  preview: () => ReviewPreview | Promise<ReviewPreview>,
  opts: Overrides & { noFrom?: boolean } = {},
): Promise<ReviewDelivery> {
  const checked = await preview();
  const key = checked.id;
  const prior = deps.store
    .get(id)
    .events.find((event): event is SavedReview => event.type === 'review' && event.id === key);
  if (prior?.status === 'delivered')
    return { id: key, target: id, status: 'delivered', already: true };
  if (prior?.status === 'pending' || prior?.status === 'uncertain')
    return {
      id: key,
      target: id,
      status: 'uncertain',
      reason: 'Inspect the session before another send',
    };

  const pending: SavedReview = {
    type: 'review',
    kind,
    id: key,
    at: deps.clock().toISOString(),
    source: checked.source,
    revision: checked.revision,
    passage: checked.passage,
    comment: checked.comment,
    ...(checked.path ? { path: checked.path } : {}),
    ...(checked.base ? { base: checked.base } : {}),
    ...(checked.staged === undefined ? {} : { staged: checked.staged }),
    status: 'pending',
  };
  let claimed = false;
  let concurrent: SavedReview | undefined;
  deps.store.update(id, (record) => {
    const index = record.events.findIndex((event) => event.type === 'review' && event.id === key);
    const found = record.events[index];
    if (found?.type === 'review' && found.status !== 'failed') {
      concurrent = found;
      return {};
    }
    claimed = true;
    const events = [...record.events];
    if (index >= 0) events[index] = pending;
    else events.push(pending);
    return { events };
  });
  if (!claimed)
    return concurrent?.status === 'delivered'
      ? { id: key, target: id, status: 'delivered', already: true }
      : {
          id: key,
          target: id,
          status: 'uncertain',
          reason: 'Inspect the session before another send',
        };

  const setStatus = (status: SavedReview['status'], reason?: string) =>
    deps.store.update(id, (record) => ({
      events: record.events.map((event) =>
        event.type === 'review' && event.id === key
          ? { ...event, status, ...(reason ? { reason } : {}) }
          : event,
      ),
    }));
  let delivery: Recorded<Sent>;
  try {
    delivery = await deps.send(id, checked.prompt, opts);
  } catch (error) {
    const safe = error instanceof MesaError && error.code === 'guardrail_blocked';
    const reason = error instanceof Error ? error.message : String(error);
    try {
      setStatus(safe ? 'failed' : 'uncertain', reason);
    } catch (saveError) {
      return {
        id: key,
        target: id,
        status: 'uncertain',
        reason: `${reason}; saved status could not be updated: ${String(saveError)}`,
      };
    }
    if (safe) throw error;
    return { id: key, target: id, status: 'uncertain', reason };
  }
  try {
    setStatus('delivered');
  } catch (error) {
    return {
      id: key,
      target: id,
      status: 'delivered',
      sent: delivery.result,
      receipt: delivery.receipt,
      warning: `Review was sent, but its saved status could not be updated: ${String(error)}. Do not retry.`,
    };
  }
  return {
    id: key,
    target: id,
    status: 'delivered',
    sent: delivery.result,
    receipt: delivery.receipt,
    ...(delivery.warning ? { warning: delivery.warning } : {}),
  };
}
