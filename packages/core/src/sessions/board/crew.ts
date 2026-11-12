import type { ChildReport } from '../../reports/reports.js';
import { isSettled, type Task } from '../../tasks/task-file.js';
import { sessionBranch, taskTitle } from '../record/labels.js';
import { diffable } from '../record/lifecycle.js';
import type { CrewReport, ManagedRow, SessionRow } from './rows.js';

/**
 * One of a parent's children (CONTEXT.md, Crew): its board row, the branch it works on, its newest
 * report that says something, and how many lines its checkout adds and removes from its base.
 */
export type CrewRow = ManagedRow & {
  branch: string | null;
  diff?: { added: number; removed: number };
};

/** `said` as a crew row keeps it; none for a report that says nothing. */
const crewReport = (said: ChildReport | undefined): CrewReport | undefined =>
  said?.message
    ? {
        kind: said.kind,
        at: said.at,
        message: said.message,
        ...(said.outcome ? { outcome: said.outcome } : {}),
        ...(said.question ? { question: said.question } : {}),
        ...(said.details ? { details: said.details } : {}),
      }
    : undefined;

/**
 * `rows` with each child's crew news (a row that reports to a session now, `parentNow`): its
 * task's title from `tasks` (taskTitle), its newest report that says something from `latest`, and
 * `asking` while it has an open question in `asking`. A coordinator whose tasks have all settled
 * shows no progress line it set before the last of them settled: it described work that is over
 * (`mesa progress` stays in its record until it ends); one set after shows. A task settled when
 * its worker last reported, else when it started or was made.
 */
export function withCrewNews(
  rows: readonly SessionRow[],
  news: {
    tasks: readonly Pick<
      Task,
      'id' | 'spec' | 'state' | 'coordinator' | 'worker' | 'startedAt' | 'createdAt'
    >[];
    latest: Readonly<Record<string, ChildReport>>;
    /** The children with an open question to their parent. */
    asking: ReadonlySet<string>;
  },
): SessionRow[] {
  const titles = new Map(news.tasks.map((task) => [task.id, taskTitle(task.spec)]));
  // When each coordinator's tasks last settled, for those whose every task has.
  const settledAt = new Map<string, string>();
  for (const task of news.tasks) {
    if (!task.coordinator) continue;
    const at = (task.worker && news.latest[task.worker]?.at) || task.startedAt || task.createdAt;
    const last = settledAt.get(task.coordinator) ?? '';
    settledAt.set(task.coordinator, at > last ? at : last);
  }
  for (const task of news.tasks) if (!isSettled(task)) settledAt.delete(task.coordinator ?? '');
  return rows.map((row) => {
    if (!row.managed) return row;
    const { progress: _over, ...rest } = row;
    const over = settledAt.get(row.id);
    const shown = row.progress && over && row.progress.at <= over ? rest : row;
    if (!row.parentNow) return shown;
    const title = row.task && titles.get(row.task);
    const report = crewReport(news.latest[row.id]);
    return {
      ...shown,
      ...(title ? { taskTitle: title } : {}),
      ...(report ? { report } : {}),
      ...(news.asking.has(row.id) ? { asking: true as const } : {}),
    };
  });
}

/**
 * `parent`'s crew: the board rows that report to it now (`parentNow`: they name it, or a session it
 * resumed or took over by handoff), oldest first, each with its newest report from `latest` and its
 * diff counts from `diffOf`, which gives none when the checkout cannot be read.
 */
export async function crewOf(
  rows: readonly SessionRow[],
  parent: string,
  latest: Readonly<Record<string, ChildReport>>,
  diffOf: (id: string) => Promise<{ added: number; removed: number } | undefined>,
): Promise<CrewRow[]> {
  const children = rows
    .filter((row): row is ManagedRow => row.managed && row.parentNow === parent)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return Promise.all(
    children.map(async (row) => {
      const { report: _board, ...rest } = row;
      const report = crewReport(latest[row.id]);
      const diff = diffable(row) ? await diffOf(row.id) : undefined;
      return {
        ...rest,
        branch: sessionBranch(row) ?? null,
        ...(report ? { report } : {}),
        ...(diff ? { diff } : {}),
      };
    }),
  );
}
