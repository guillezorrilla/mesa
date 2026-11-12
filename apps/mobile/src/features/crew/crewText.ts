import type { PhoneCrew, PhoneMerge, PhoneTask, PhoneWorker } from '@mesa/core/phone';

// How the phone reads a crew (CONTEXT.md, Crew): a worker's report, the task graph's order and
// each task's words and colour, and a merge's outcome, as the desktop's Crew panel says them.

type Report = NonNullable<PhoneWorker['report']>;

const REPORT_WORDS: Record<string, string> = {
  done: 'Done',
  failed: 'Failed',
  blocked: 'Blocked',
  question: 'Asks',
  gate: 'Decided',
  finished: 'Finished a turn',
  waiting: 'Waiting',
  ended: 'Ended',
};

/** A worker's newest report in one line: "Done: tests pass", "Asks: metres or feet?". */
export const reportText = (report: Report) =>
  `${REPORT_WORDS[report.kind] ?? report.kind}: ${report.message}`;

/** Ready ones first, then running, waiting on a decision or a dep, then the settled ones. */
const RANK: Record<string, number> = {
  ready: 0,
  running: 1,
  blocked: 2,
  pending: 3,
  succeeded: 4,
  failed: 5,
  cancelled: 6,
};

/** The task graph in the order the person acts on it, plan order kept within each state. */
export const taskOrder = (tasks: readonly PhoneTask[]) =>
  tasks.toSorted((a, b) => (RANK[a.state] ?? 7) - (RANK[b.state] ?? 7));

/** A task's state in words, naming the deps it still waits on. */
export function taskWords(task: PhoneTask, crew: Pick<PhoneCrew, 'tasks'>) {
  switch (task.state) {
    case 'ready':
      return 'Ready to start';
    case 'running':
      return 'Running';
    case 'blocked':
      return task.gate ? 'Waits for your decision' : 'Blocked';
    case 'pending': {
      const waits = task.deps.flatMap((id) => {
        const dep = crew.tasks.find((each) => each.id === id);
        return dep?.state === 'succeeded' ? [] : [dep?.title ?? 'an earlier task'];
      });
      return waits.length ? `Waits for ${waits.join(', ')}` : 'Waiting';
    }
    case 'succeeded':
      return 'Done';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return task.state;
  }
}

/** A task state's colour, Mesa's state tokens: a person's turn, at work, over, failed. */
export function taskColor(state: string) {
  if (state === 'blocked' || state === 'ready') return 'bg-state-waiting';
  if (state === 'running') return 'bg-state-working';
  if (state === 'failed') return 'bg-state-failed';
  return state === 'succeeded' ? 'bg-state-done' : 'bg-state-idle';
}

/** A merge's outcome in words; the conflicting files are listed beside it. */
export const mergeText = (merge: PhoneMerge) =>
  merge.merged
    ? `Merged ${merge.branch} into this session`
    : `Not merged: ${merge.conflicts.length} ${merge.conflicts.length === 1 ? 'file conflicts' : 'files conflict'}, so the merge was aborted`;
