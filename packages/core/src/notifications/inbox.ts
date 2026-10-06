import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { MesaContext } from '../context.js';
import type { DoctorReport } from '../doctor/doctor.js';
import { lockedBy, withLockSync } from '../lib/lock-file.js';
import { MesaError } from '../lib/result.js';
import { scanHookEvents } from '../sessions/signals/hook-events.js';
import { type DeliveryPlan, planDelivery } from './delivery-plan.js';
import {
  type AutomationRunNotice,
  type Candidate,
  doctorFindings,
  doctorItem,
  failureItems,
  hookItem,
  type InboxItem,
} from './inbox-items.js';
import { type InboxState, inboxStore } from './inbox-store.js';

/** The notices `state` keeps and `failures` add, newest first, without the cleared ones. */
function inboxItems(state: InboxState, failures: Candidate[]): InboxItem[] {
  const entries: Candidate[] = [...state.items, ...state.doctor.map(doctorItem), ...failures];
  entries.sort((a, b) => a.at.localeCompare(b.at));
  const cleared = new Set(state.cleared);
  const readIds = new Set(state.read);
  return entries
    .filter((entry) => !cleared.has(`${entry.at}:${entry.fingerprint}`))
    .map(({ fingerprint, ...entry }) => ({
      ...entry,
      id: `${entry.at}:${fingerprint}`,
      read: readIds.has(`${entry.at}:${fingerprint}`),
    }))
    .reverse();
}

/**
 * A bounded, durable inbox projected from the profile's redacted hooks, its Doctor findings, and
 * the failed runs `automationRuns` reads from the run ledger.
 */
export function inbox(ctx: MesaContext, automationRuns: () => readonly AutomationRunNotice[]) {
  // The run ledger is the event owner: a crash between failure and notification loses no notice.
  const failures = () => failureItems(automationRuns());
  const store = inboxStore(ctx.paths.notifications, ctx, failures);
  const list = (): InboxItem[] => {
    const current = store.read();
    const fresh: Candidate[] = [];
    const offsets: Record<string, number> = {};
    for (const record of ctx.store.list()) {
      const before = current.offsets[record.id] ?? 0;
      const after = scanHookEvents(ctx.paths.events, record.id, before, (event) => {
        const item = hookItem(record.id, event);
        if (item) fresh.push(item);
      });
      if (after !== before) offsets[record.id] = after;
    }
    const state =
      fresh.length || Object.keys(offsets).length
        ? store.write({ items: fresh, offsets })
        : current;
    return inboxItems(state, failures());
  };
  const change = (id: string, field: 'read' | 'cleared') => {
    if (!list().some((item) => item.id === id))
      throw new MesaError('not_found', `no inbox item ${id}`);
    store.write({ read: field === 'read' ? [id] : [], cleared: field === 'cleared' ? [id] : [] });
  };
  const delivery = (): DeliveryPlan => {
    const state = store.read();
    const startedAt = state.startedAt ?? ctx.clock().toISOString();
    if (!state.startedAt) store.write({ startedAt });
    const settings = ctx.open().config.notifications;
    const { plan, skipped } = planDelivery(list(), settings, {
      startedAt,
      delivered: state.delivered,
    });
    if (skipped.length) store.write({ delivered: skipped });
    return plan;
  };
  const markDelivered = (ids: string[]) => {
    const state = store.read();
    const known = new Set([...list().map((item) => item.id), ...state.cleared, ...state.delivered]);
    if (!ids.length || ids.length > 500 || ids.some((id) => !known.has(id)))
      throw new MesaError('not_found', 'notification item not found');
    store.write({ delivered: ids });
  };
  return {
    list,
    markRead: (id: string) => change(id, 'read'),
    clear: (id: string) => change(id, 'cleared'),
    /** Clears every notice shown now in one write; kept hook offsets stop them coming back. */
    clearAll: () => {
      const ids = list().map((item) => item.id);
      if (ids.length) store.write({ cleared: ids });
      return ids.length;
    },
    delivery,
    /** App and background worker claim through the same short, synchronous lock. */
    claimDelivery: () => {
      mkdirSync(dirname(store.file), { recursive: true, mode: 0o700 });
      const lock = `${store.file}.delivery.lock`;
      return withLockSync(
        ctx,
        lock,
        () => {
          const plan = delivery();
          if (plan.kind !== 'none') markDelivered(plan.ids);
          return plan;
        },
        () => lockedBy('notification delivery', lock, 'notifications'),
      );
    },
    markDelivered,
    recordDoctor: (report: DoctorReport) => {
      const state = store.read();
      const now = ctx.clock().toISOString();
      // A finding seen before keeps its time, so its read or cleared mark still applies.
      store.write({
        startedAt: state.startedAt ?? now,
        doctor: doctorFindings(report).map((finding) => ({
          ...finding,
          at: state.doctor.find((entry) => entry.fingerprint === finding.fingerprint)?.at ?? now,
        })),
      });
    },
  };
}
