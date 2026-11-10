import { z } from 'zod';
import { changeJson, readJson } from '../lib/json-file.js';
import type { LockDeps } from '../lib/lock-file.js';
import { familyOf } from '../sessions/record/family.js';
import type { SessionRecord } from '../sessions/record/record.js';
import { scanHookEvents } from '../sessions/signals/hook-events.js';
import {
  addReport,
  type ChildReport,
  ChildReportSchema,
  endedReport,
  eventReport,
  isExplicit,
  type Question,
  QuestionSchema,
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
    /**
     * Each child's newest explicit report (`mesa report`), kept after delivery: once one is made,
     * the child's later turns make no `finished` report.
     */
    explicit: z.record(z.string(), ChildReportSchema).default({}),
    /** Workers' questions, open and answered, oldest first. */
    questions: z.array(QuestionSchema).default([]),
    /** Each child's newest report that says something, of any kind, kept after delivery. */
    latest: z.record(z.string(), ChildReportSchema).default({}),
  })
  .describe('child reports');
type State = z.infer<typeof State>;

/** `latest` with `report` kept as its child's newest when it says something and is newer. */
const withLatest = (latest: State['latest'], report: ChildReport): State['latest'] => {
  const kept = latest[report.child];
  return report.message && (!kept || kept.at <= report.at)
    ? { ...latest, [report.child]: report }
    : latest;
};

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
    /** The questions, open and answered, as last written. */
    questions: (): Question[] => readJson(file, State)?.questions ?? [],
    /** Adds a worker's question, and the report that carries it, pending until delivered. */
    ask: (question: Question, report: ChildReport) =>
      change((state) => ({
        next: {
          ...state,
          pending: addReport(state.pending, report),
          questions: [...state.questions, question],
          latest: withLatest(state.latest, report),
        },
        result: undefined,
      })),
    /**
     * Claims question `id` for one answer: marks it answered and takes its report off the pending
     * ones, so nobody is asked to answer it again. None when it is gone or another answer came
     * first; the claim, with the report it took, for `reopen`.
     */
    answer: (id: string, answer: Pick<Question, 'answer' | 'answeredAt' | 'answeredBy'>) =>
      change((state) => {
        const found = state.questions.find((q) => q.id === id);
        if (!found || found.answeredAt) return { next: state, result: undefined };
        const question = { ...found, ...answer };
        const report = state.pending.find((r) => r.question === id);
        return {
          next: {
            ...state,
            questions: state.questions.map((q) => (q.id === id ? question : q)),
            pending: state.pending.filter((r) => r.question !== id),
          },
          result: { question, report },
        };
      }),
    /** Opens a claimed question again, with its report, when its answer could not be typed. */
    reopen: (claim: { question: Question; report?: ChildReport }) =>
      change((state) => {
        const { answer: _a, answeredAt: _at, answeredBy: _by, ...open } = claim.question;
        return {
          next: {
            ...state,
            questions: state.questions.map((q) => (q.id === open.id ? open : q)),
            pending: claim.report ? addReport(state.pending, claim.report) : state.pending,
          },
          result: undefined,
        };
      }),
    /** `child`'s newest explicit report, delivered or not. */
    explicit: (child: string): ChildReport | undefined => readJson(file, State)?.explicit[child],
    /** Each child's newest report that says something, delivered or not, as last written. */
    latest: (): Record<string, ChildReport> => {
      const state = readJson(file, State);
      // An explicit report from before `latest` was kept still counts as the child's newest.
      return { ...state?.explicit, ...state?.latest };
    },
    /**
     * Adds a worker's explicit report to the pending ones in place of its older explicit one
     * (even one made the same millisecond), and keeps it as its newest.
     */
    add: (report: ChildReport) =>
      change((state) => ({
        next: {
          ...state,
          pending: addReport(
            state.pending.filter((r) => r.child !== report.child || !isExplicit(r)),
            report,
          ),
          explicit: { ...state.explicit, [report.child]: report },
          latest: withLatest(state.latest, report),
        },
        result: undefined,
      })),
    /** Adds a `gate` report, pending until delivered; it is no child's news, so nothing else keeps it. */
    addGate: (report: ChildReport) =>
      change((state) => ({
        next: { ...state, pending: addReport(state.pending, report) },
        result: undefined,
      })),
    /**
     * Reads every child's new hook events and endings in `records` into the pending reports, and
     * forgets the reports, read offsets and endings of sessions no longer in `records`; returns
     * what is pending. Each child's `parent` in `records` is where it reports now, so a pending
     * report or question follows it there. A parent that is over keeps its reports, for a successor
     * to take.
     */
    collect: (records: readonly SessionRecord[], now: string): ChildReport[] =>
      change((state) => {
        const since = state.since ?? now;
        const known = new Set(records.map((record) => record.id));
        let pending = state.pending;
        let latest = state.latest;
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
              // A child that reported its work itself makes no `finished` report after it.
              const said = state.explicit[child.id];
              if (report && report.kind === 'finished' && said && report.at >= said.at) return;
              if (!report) return;
              pending = addReport(pending, report);
              latest = withLatest(latest, report);
            },
          );
          if (child.endedAt && !ended.includes(child.id)) {
            ended.push(child.id);
            if (child.endedAt >= since)
              pending = addReport(pending, endedReport({ ...child, endedAt: child.endedAt }));
          }
        }
        // A report or question made before its parent was resumed or handed off goes to the successor.
        const parentOf = new Map(records.map((r) => [r.id, r.parent]));
        const toParentNow = <T extends { child: string; parent: string }>(r: T): T => {
          const parent = parentOf.get(r.child);
          return parent && parent !== r.parent ? { ...r, parent } : r;
        };
        // A gate report has no child: it follows its parent's own successor.
        const successor = familyOf(records);
        const reportToParentNow = (r: ChildReport): ChildReport => {
          if (r.kind !== 'gate') return toParentNow(r);
          const parent = successor({ id: r.id, parent: r.parent });
          return parent && parent !== r.parent ? { ...r, parent } : r;
        };
        pending = pending
          .map(reportToParentNow)
          .filter((report) => known.has(report.parent) && known.has(report.child));
        const explicit = Object.fromEntries(
          Object.entries(state.explicit).filter(([child]) => known.has(child)),
        );
        const questions = state.questions
          .map(toParentNow)
          .filter((q) => known.has(q.parent) && known.has(q.child));
        latest = Object.fromEntries(Object.entries(latest).filter(([child]) => known.has(child)));
        return {
          next: { since, offsets, ended, pending, explicit, questions, latest },
          result: pending,
        };
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
