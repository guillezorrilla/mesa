import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { MesaContext } from '../context.js';
import type { DoctorReport } from '../doctor/doctor.js';
import { lockedBy, withLockSync } from '../lib/lock-file.js';
import { MesaError } from '../lib/result.js';
import { changelogNotes, type ReleaseNotes } from '../release/notes.js';
import { versionsSince } from '../release/versions.js';
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
  releaseItem,
  shownInInbox,
} from './inbox-items.js';
import { type InboxState, inboxStore } from './inbox-store.js';

/**
 * The notices `state` keeps and `failures` add, newest first, without the cleared ones; a release
 * notice gets its notes from `notes`.
 */
function inboxItems(
  state: InboxState,
  failures: Candidate[],
  notes: () => ReleaseNotes[],
): InboxItem[] {
  // Release notices are kept oldest version first, so the stable sort on equal times lists the
  // newest first.
  const entries: Candidate[] = [
    ...state.items,
    ...state.doctor.map(doctorItem),
    ...state.releases.map(releaseItem),
    ...failures,
  ];
  entries.sort((a, b) => a.at.localeCompare(b.at));
  const cleared = new Set(state.cleared);
  const readIds = new Set(state.read);
  return entries
    .filter((entry) => !cleared.has(`${entry.at}:${entry.fingerprint}`))
    .map(({ fingerprint, ...entry }) => {
      const { target } = entry;
      const release =
        target.kind === 'release' && notes().find((section) => section.version === target.version);
      return {
        ...entry,
        ...(release ? { notes: release } : {}),
        id: `${entry.at}:${fingerprint}`,
        read: readIds.has(`${entry.at}:${fingerprint}`),
      };
    })
    .reverse();
}

/**
 * A bounded, durable inbox projected from the profile's redacted hooks, its Doctor findings, the
 * failed runs `automationRuns` reads from the run ledger, and the versions installed since the
 * last one seen, from the changelog Mesa ships.
 */
export function inbox(ctx: MesaContext, automationRuns: () => readonly AutomationRunNotice[]) {
  // The run ledger is the event owner: a crash between failure and notification loses no notice.
  const failures = () => failureItems(automationRuns());
  const store = inboxStore(ctx.paths.notifications, ctx, failures);
  let changelog: ReleaseNotes[] | undefined;
  const notes = () => {
    changelog ??= changelogNotes(ctx.changelog);
    return changelog;
  };
  /**
   * Records a newer running version, with a release notice per version since the last one seen;
   * a fresh profile gets none, so a first run shows onboarding, and a downgrade changes nothing. A
   * profile from before #639 has an inbox but no version seen: it gets the running version's.
   */
  const seeVersion = (state: InboxState) => {
    const { seenVersion: seen } = state;
    const running = ctx.version;
    if (seen === running) return state;
    const versions =
      seen || !existsSync(store.file)
        ? versionsSince(notes(), seen, running)
        : notes()
            .filter((section) => section.version === running)
            .map((section) => section.version);
    if (!versions) return state;
    const at = ctx.clock().toISOString();
    return store.write({
      seenVersion: running,
      releases: versions.map((version) => ({ version, at })),
    });
  };
  /** The state, after seeVersion: it runs before any other write, so a fresh profile is known. */
  const read = () => seeVersion(store.read());
  /** Every notice, a finished turn's too: native delivery reads them by its own setting. */
  const all = (records = ctx.store.readable()): InboxItem[] => {
    const current = read();
    const fresh: Candidate[] = [];
    const offsets: Record<string, number> = {};
    for (const record of records) {
      const before = current.offsets[record.id] ?? 0;
      const after = scanHookEvents(ctx.paths.events, record.id, before, (event) => {
        const item = hookItem(record.id, event);
        if (item) fresh.push(item);
      });
      if (after !== before) offsets[record.id] = after;
    }
    // A state written before #687 holds several notices per session; a write keeps the newest.
    const stale = new Set(current.items.map((item) => item.session)).size < current.items.length;
    const state =
      fresh.length || Object.keys(offsets).length || stale
        ? store.write({ items: fresh, offsets })
        : current;
    return inboxItems(state, failures(), notes);
  };
  /** What the Inbox shows (shownInInbox). */
  const list = () => all().filter(shownInInbox);
  const change = (id: string, field: 'read' | 'cleared') => {
    if (!all().some((item) => item.id === id))
      throw new MesaError('not_found', `no inbox item ${id}`);
    store.write({ read: field === 'read' ? [id] : [], cleared: field === 'cleared' ? [id] : [] });
  };
  const delivery = (): DeliveryPlan => {
    const state = read();
    const startedAt = state.startedAt ?? ctx.clock().toISOString();
    if (!state.startedAt) store.write({ startedAt });
    const settings = ctx.open().config.notifications;
    const records = ctx.store.readable();
    const seenAt = new Map(records.map((r) => [r.id, r.seenAt]));
    const { plan, skipped } = planDelivery(all(records), settings, {
      startedAt,
      delivered: state.delivered,
      now: ctx.clock().toISOString(),
      seenAt: (session) => seenAt.get(session),
    });
    if (skipped.length) store.write({ delivered: skipped });
    return plan;
  };
  const markDelivered = (ids: string[]) => {
    const state = read();
    const known = new Set([...all().map((item) => item.id), ...state.cleared, ...state.delivered]);
    if (!ids.length || ids.length > 500 || ids.some((id) => !known.has(id)))
      throw new MesaError('not_found', 'notification item not found');
    store.write({ delivered: ids });
  };
  return {
    list,
    markRead: (id: string) => change(id, 'read'),
    clear: (id: string) => change(id, 'cleared'),
    /**
     * Clears every notice in one write, a hidden finished turn's too, so none is delivered later;
     * kept hook offsets stop them coming back. Counts the ones the Inbox showed.
     */
    clearAll: () => {
      const items = all();
      if (items.length) store.write({ cleared: items.map((item) => item.id) });
      return items.filter(shownInInbox).length;
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
      const state = read();
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
