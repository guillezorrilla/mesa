import { z } from 'zod';
import { changeJson, readJson } from '../lib/json-file.js';
import type { LockDeps } from '../lib/lock-file.js';
import {
  type Candidate,
  CandidateSchema,
  DoctorFindingSchema,
  doctorItem,
  ReleaseSeenSchema,
  releaseItem,
} from './inbox-items.js';

const InboxStateSchema = z
  .strictObject({
    read: z.array(z.string()),
    cleared: z.array(z.string()),
    delivered: z.array(z.string()).default([]),
    items: z.array(CandidateSchema).default([]),
    offsets: z.record(z.string(), z.number().int().nonnegative()).default({}),
    doctor: z.array(DoctorFindingSchema).default([]),
    startedAt: z.iso.datetime().optional(),
    /** The newest Mesa version this profile has run, which release notices count from. */
    seenVersion: z.string().optional(),
    releases: z.array(ReleaseSeenSchema).default([]),
  })
  .describe('inbox state');
export type InboxState = z.infer<typeof InboxStateSchema>;
const EMPTY: InboxState = {
  read: [],
  cleared: [],
  delivered: [],
  doctor: [],
  items: [],
  offsets: {},
  releases: [],
};

/**
 * Adds `change` to the state: hook notices deduplicated within two seconds, one per session (its
 * newest, as a later event makes the earlier ones stale) and the latest 500 sessions, the latest
 * 5 release notices, marks joined, offsets only moving forward. A mark lives as long as its notice, including
 * the `failures` the state does not keep.
 */
function merge(current: InboxState, change: Partial<InboxState>, failures: Candidate[]) {
  const entries = [...current.items, ...(change.items ?? [])].sort((a, b) =>
    a.at.localeCompare(b.at),
  );
  const distinct: Candidate[] = [];
  const last = new Map<string, number>();
  for (const entry of entries) {
    const at = Date.parse(entry.at);
    if (at - (last.get(entry.fingerprint) ?? -Infinity) < 2_000) continue;
    distinct.push(entry);
    last.set(entry.fingerprint, at);
  }
  const newest = new Map(distinct.map((entry) => [entry.session, entry]));
  const next = {
    read: [...new Set([...current.read, ...(change.read ?? [])])],
    cleared: [...new Set([...current.cleared, ...(change.cleared ?? [])])],
    delivered: [...new Set([...current.delivered, ...(change.delivered ?? [])])],
    items: distinct.filter((entry) => newest.get(entry.session) === entry).slice(-500),
    offsets: Object.fromEntries(
      [...new Set([...Object.keys(current.offsets), ...Object.keys(change.offsets ?? {})])].map(
        (id) => [id, Math.max(current.offsets[id] ?? 0, change.offsets?.[id] ?? 0)],
      ),
    ),
    doctor: change.doctor ?? current.doctor,
    startedAt: current.startedAt ?? change.startedAt,
    seenVersion: change.seenVersion ?? current.seenVersion,
    // Oldest version first, so the newest 5 stay.
    releases: [...current.releases, ...(change.releases ?? [])].slice(-5),
  };
  const retained = new Set(
    [
      ...next.items,
      ...next.doctor.map(doctorItem),
      ...next.releases.map(releaseItem),
      ...failures,
    ].map((item) => `${item.at}:${item.fingerprint}`),
  );
  next.read = next.read.filter((id) => retained.has(id));
  next.cleared = next.cleared.filter((id) => retained.has(id));
  // Keep each acknowledgement as long as its notice, including failed automation runs.
  next.delivered = next.delivered.filter((id) => retained.has(id));
  return next;
}

/** The inbox's durable, bounded state file; `failures` are read inside each write's lock. */
export function inboxStore(file: string, lock: LockDeps, failures: () => Candidate[]) {
  return {
    file,
    read: (): InboxState => readJson(file, InboxStateSchema) ?? EMPTY,
    write: (change: Partial<InboxState>) =>
      changeJson(
        file,
        InboxStateSchema,
        (current = EMPTY) => merge(current, change, failures()),
        lock,
      ),
  };
}
