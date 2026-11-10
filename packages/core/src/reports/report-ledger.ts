import { z } from 'zod';
import { changeJson } from '../lib/json-file.js';
import type { LockDeps } from '../lib/lock-file.js';
import type { SessionRecord } from '../sessions/record/record.js';
import { scanHookEvents } from '../sessions/signals/hook-events.js';
import {
  addReport,
  type ChildReport,
  endedReport,
  eventReport,
  reportsToParent,
} from './reports.js';

const Report = z.object({
  id: z.string(),
  parent: z.string(),
  child: z.string(),
  childName: z.string(),
  kind: z.enum(['finished', 'waiting', 'ended']),
  at: z.string(),
  message: z.string().optional(),
  tool: z.string().optional(),
  state: z.string().optional(),
});

const State = z
  .strictObject({
    /** When reports began: nothing older makes one, so turning them on reports no history. */
    since: z.string().optional(),
    /** How far each child's hook log was read. */
    offsets: z.record(z.string(), z.number()).default({}),
    /** Children whose `ended` report was made. */
    ended: z.array(z.string()).default([]),
    pending: z.array(Report).default([]),
  })
  .describe('child reports');
type State = z.infer<typeof State>;

/** Ended children remembered: far more than the children live at once. */
const KEPT = 2_000;

/**
 * The profile's child reports not yet typed into their parent, `reports.json`: read from each
 * child's hook log since the last read, and claimed under the lock, so each is typed once across
 * processes and restarts.
 */
export function reportLedger(file: string, eventsDir: string, deps: LockDeps) {
  const change = <T>(fn: (state: State) => { next: State; result: T }): T => {
    let result: T | undefined;
    changeJson(
      file,
      State,
      (current) => {
        const changed = fn(current ?? State.parse({}));
        result = changed.result;
        return { ...changed.next, ended: changed.next.ended.slice(-KEPT) };
      },
      deps,
    );
    return result as T;
  };
  return {
    /**
     * Reads every child's new hook events and endings in `records` into the pending reports, and
     * drops those whose parent is gone or over; returns what is pending.
     */
    collect: (records: readonly SessionRecord[], now: string): ChildReport[] =>
      change((state) => {
        const since = state.since ?? now;
        const byId = new Map(records.map((record) => [record.id, record]));
        const live = (id: string) => {
          const parent = byId.get(id);
          return parent !== undefined && !parent.endedAt;
        };
        let pending = state.pending as ChildReport[];
        const offsets = { ...state.offsets };
        const ended = [...state.ended];
        for (const child of records.filter(reportsToParent)) {
          offsets[child.id] = scanHookEvents(
            eventsDir,
            child.id,
            offsets[child.id] ?? 0,
            (event) => {
              const report = event.at >= since && live(child.parent) && eventReport(child, event);
              if (report) pending = addReport(pending, report);
            },
          );
          if (child.endedAt && !ended.includes(child.id)) {
            ended.push(child.id);
            if (child.endedAt >= since && live(child.parent))
              pending = addReport(pending, endedReport({ ...child, endedAt: child.endedAt }));
          }
        }
        pending = pending.filter((report) => live(report.parent));
        return { next: { since, offsets, ended, pending }, result: pending };
      }),
    /** Takes `ids` off the pending list for one send: those no other process took first. */
    claim: (ids: readonly string[]): ChildReport[] =>
      change((state) => {
        const claimed = (state.pending as ChildReport[]).filter((r) => ids.includes(r.id));
        const pending = state.pending.filter((r) => !ids.includes(r.id));
        return { next: { ...state, pending }, result: claimed };
      }),
    /** Gives back claimed reports whose send was refused before anything was typed. */
    release: (reports: readonly ChildReport[]) =>
      change((state) => ({
        next: { ...state, pending: reports.reduce(addReport, state.pending as ChildReport[]) },
        result: undefined,
      })),
  };
}
