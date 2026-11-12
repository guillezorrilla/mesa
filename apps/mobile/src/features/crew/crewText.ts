import {
  type PhoneCrew,
  type PhoneMerge,
  type PhoneTask,
  type PhoneWorker,
  WAITING_STATES,
} from '@mesa/core/phone';

// How the phone reads a crew (CONTEXT.md, Crew): a worker's report, the task graph's order and
// each task's words and colour, and a merge's outcome.

type Report = Pick<NonNullable<PhoneWorker['report']>, 'kind'>;

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

/** A worker's report kind in a word: "Done", "Asks"; a newer Mac's kind as it is. */
export const reportWord = (report: Report) => REPORT_WORDS[report.kind] ?? report.kind;

/** A report kind's colour: done green, failed red, blocked or a question the person's turn. */
export function reportColor(report: Report) {
  if (report.kind === 'done') return 'text-state-done';
  if (report.kind === 'failed') return 'text-state-failed';
  if (report.kind === 'blocked' || report.kind === 'question') return 'text-state-waiting';
  return 'text-muted-foreground';
}

/**
 * Each task state's place in the list (ready first), its words, and its colour: ready and
 * running as at work, blocked as the person's turn, settled ones as over or failed.
 */
const TASK_LOOK: Record<string, { rank: number; words: string; color: string }> = {
  ready: { rank: 0, words: 'Ready to start', color: 'bg-state-working' },
  running: { rank: 1, words: 'Running', color: 'bg-state-working' },
  blocked: { rank: 2, words: 'Blocked', color: 'bg-state-waiting' },
  pending: { rank: 3, words: 'Waiting', color: 'bg-state-idle' },
  succeeded: { rank: 4, words: 'Done', color: 'bg-state-done' },
  failed: { rank: 5, words: 'Failed', color: 'bg-state-failed' },
  cancelled: { rank: 6, words: 'Cancelled', color: 'bg-state-idle' },
};
const lookOf = (state: string) =>
  TASK_LOOK[state] ?? { rank: 7, words: state, color: 'bg-state-idle' };

/** The task graph in the order the person acts on it, plan order kept within each state. */
export const taskOrder = (tasks: readonly PhoneTask[]) =>
  tasks.toSorted((a, b) => lookOf(a.state).rank - lookOf(b.state).rank);

/** A task's state's colour, Mesa's state tokens. */
export const taskColor = (state: string) => lookOf(state).color;

/** A task's state in words, naming the decision or the deps it still waits on. */
export function taskWords(task: PhoneTask, crew: Pick<PhoneCrew, 'tasks'>) {
  if (task.state === 'blocked' && task.gate) return 'Waits for your decision';
  if (task.state !== 'pending') return lookOf(task.state).words;
  const waits = task.deps.flatMap((id) => {
    const dep = crew.tasks.find((each) => each.id === id);
    return dep?.state === 'succeeded' ? [] : [dep?.title ?? 'an earlier task'];
  });
  return waits.length ? `Waits for ${waits.join(', ')}` : 'Waiting';
}

/** A merge's outcome in words; the conflicting files are listed beside it. */
export const mergeText = (merge: PhoneMerge) =>
  merge.merged
    ? `Merged ${merge.branch} into this session`
    : `Not merged: ${merge.conflicts.length} ${merge.conflicts.length === 1 ? 'file conflicts' : 'files conflict'}, so the merge was aborted`;

/** Whether a worker is in its turn (working, or waiting on a person), when Mesa refuses a merge. */
export const inTurn = (state: string) =>
  state === 'working' || (WAITING_STATES as ReadonlySet<string>).has(state);
