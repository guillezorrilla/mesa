import type { ChildReport } from '../../reports/reports.js';
import { sessionBranch } from '../record/labels.js';
import { diffable } from '../record/lifecycle.js';
import type { ManagedRow, SessionRow } from './rows.js';

/** A child's newest report that says something, as the Crew panel shows it. */
export type CrewReport = Pick<ChildReport, 'kind' | 'at' | 'outcome' | 'question' | 'details'> & {
  message: string;
};

/**
 * One of a parent's children (CONTEXT.md, Crew): its board row, the branch it works on, its newest
 * report that says something, and how many lines its checkout adds and removes from its base.
 */
export type CrewRow = ManagedRow & {
  branch: string | null;
  report?: CrewReport;
  diff?: { added: number; removed: number };
};

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
      const said = latest[row.id];
      const diff = diffable(row) ? await diffOf(row.id) : undefined;
      return {
        ...row,
        branch: sessionBranch(row) ?? null,
        ...(said?.message
          ? {
              report: {
                kind: said.kind,
                at: said.at,
                message: said.message,
                ...(said.outcome ? { outcome: said.outcome } : {}),
                ...(said.question ? { question: said.question } : {}),
                ...(said.details ? { details: said.details } : {}),
              },
            }
          : {}),
        ...(diff ? { diff } : {}),
      };
    }),
  );
}
