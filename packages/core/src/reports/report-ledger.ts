import { z } from 'zod';
import { changeJson, readJson } from '../lib/json-file.js';
import type { LockDeps } from '../lib/lock-file.js';
import type { SessionRecord } from '../sessions/record/record.js';
import { scanHookEvents } from '../sessions/signals/hook-events.js';
import {
  addReport,
  type ChildReport,
  ChildReportSchema,
  endedReport,
  eventReport,
  reportsToParent,
} from './reports.js';

const State = z
  .strictObject({
    /**
     * When reports first ran: nothing older makes one, so a new profile, or one from before child
     * reports, reports no history. A child's events while reports were off are read when they come
     * back on, and only its newest report of each kind is kept.
     */
    since: z.string().optional(),
    /** How far each child's hook log was read. */
    offsets: z.record(z.string(), z.number()).default({}),
    /** Children whose `ended` report was made. */
    ended: z.array(z.string()).default([]),
    pending: z.array(ChildReportSchema).default([]),
  })
  .describe('child reports');
type State = z.infer<typeof State>;

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
        return changed.next;
      },
      deps,
    );
    return result as T;
  };
  return {
    /** The pending reports as last collected, read without collecting. */
    pending: (): ChildReport[] => readJson(file, State)?.pending ?? [],
    /**
     * Reads every child's new hook events and endings in `records` into the pending reports, and
     * forgets the reports, read offsets and endings of sessions no longer in `records`; returns
     * what is pending. A parent that is over keeps its reports, for a successor to take.
     */
    collect: (records: readonly SessionRecord[], now: string): ChildReport[] =>
      change((state) => {
        const since = state.since ?? now;
        const known = new Set(records.map((record) => record.id));
        let pending = state.pending;
        const offsets: Record<string, number> = {};
        const ended = state.ended.filter((id) => known.has(id));
        for (const child of records.filter(reportsToParent)) {
          if (!known.has(child.parent)) continue;
          offsets[child.id] = scanHookEvents(
            eventsDir,
            child.id,
            state.offsets[child.id] ?? 0,
            (event) => {
              const report = event.at >= since && eventReport(child, event);
              if (report) pending = addReport(pending, report);
            },
          );
          if (child.endedAt && !ended.includes(child.id)) {
            ended.push(child.id);
            if (child.endedAt >= since)
              pending = addReport(pending, endedReport({ ...child, endedAt: child.endedAt }));
          }
        }
        pending = pending.filter((report) => known.has(report.parent) && known.has(report.child));
        return { next: { since, offsets, ended, pending }, result: pending };
      }),
    /** Takes `ids` off the pending list for one send: those no other process took first. */
    claim: (ids: readonly string[]): ChildReport[] =>
      change((state) => {
        const claimed = state.pending.filter((r) => ids.includes(r.id));
        const pending = state.pending.filter((r) => !ids.includes(r.id));
        return { next: { ...state, pending }, result: claimed };
      }),
    /** Gives back claimed reports whose send was refused before anything was typed. */
    release: (reports: readonly ChildReport[]) =>
      change((state) => ({
        next: { ...state, pending: reports.reduce(addReport, state.pending) },
        result: undefined,
      })),
  };
}
