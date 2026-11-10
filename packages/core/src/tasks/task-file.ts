import { z } from 'zod';

// The profile's tasks as `tasks.json` holds them (CONTEXT.md, Task), and how a read settles them.

/**
 * Where a task stands: `pending` while a dep has not succeeded, `ready` to start (no deps, or all
 * succeeded), `running` with a worker, then `succeeded`, `failed` or `cancelled`.
 */
const TASK_STATES = ['pending', 'ready', 'running', 'succeeded', 'failed', 'cancelled'] as const;
export type TaskState = (typeof TASK_STATES)[number];

/** A unit of planned work a worker session may do, in a Task graph (CONTEXT.md, Task). */
const TaskSchema = z.strictObject({
  id: z.string(),
  spec: z.string(),
  graph: z.string(),
  /**
   * The tasks it waits on, in any graph; they existed when it was made and never change, so no
   * cycle forms. A shortcut id clash (40 random bits) is not checked.
   */
  deps: z.array(z.string()),
  state: z.enum(TASK_STATES),
  /** The session that planned it: the Caller, or `--coordinator`; none from a person outside one. */
  coordinator: z.string().optional(),
  createdAt: z.iso.datetime(),
  /** When a start claimed it (`running`), before its worker opened. */
  startedAt: z.iso.datetime().optional(),
  /** The worker session doing it, once open. */
  worker: z.string().optional(),
  /** Why it failed: its worker's `failed` report, an ending without one, or failed starts. */
  reason: z.string().optional(),
  /** Starts in a row whose session never opened; three fail the task. */
  startFailures: z.number().int().positive().optional(),
});
export type Task = z.infer<typeof TaskSchema>;

export const TaskFile = z
  .strictObject({ tasks: z.array(TaskSchema).default([]) })
  .describe('task graphs');
export type TaskFile = z.infer<typeof TaskFile>;

/** Whether `task` waits to start: `pending` or `ready`, which its deps decide. */
export const isOpen = (task: Pick<Task, 'state'>) =>
  task.state === 'pending' || task.state === 'ready';

/**
 * `tasks` with `pending` and `ready` worked out from their deps, never trusted from the file, so
 * a settled dep unlocks its dependents without anyone writing them. Deps are older than their
 * task (they existed when it was made), so one pass in file order sees each dep's state first.
 */
export function withStates(tasks: readonly Task[]): Task[] {
  const states = new Map<string, TaskState>();
  return tasks.map((task) => {
    const state = !isOpen(task)
      ? task.state
      : task.deps.every((dep) => states.get(dep) === 'succeeded')
        ? 'ready'
        : 'pending';
    states.set(task.id, state);
    return state === task.state ? task : { ...task, state };
  });
}

/** What settling reads of a running task's worker: its newest explicit report, and its ending. */
export type WorkerNews = {
  report?: { kind: string; message: string };
  /** Gone, or its record has `endedAt`. */
  ended: boolean;
};

/**
 * How long a claimed start may go without its worker before it counts as a failed start (the
 * mesa that claimed it was killed); longer than any worktree setup and agent start.
 */
const START_GRACE_MS = 30 * 60_000;
const START_LIMIT = 3;

/** `task` back to waiting, with one more failed start, or failed at the START_LIMIT. */
export function failedStart(task: Task, why: string): Task {
  const { startedAt: _s, worker: _w, ...rest } = task;
  const count = (task.startFailures ?? 0) + 1;
  return count >= START_LIMIT
    ? {
        ...rest,
        state: 'failed',
        reason: `start failed ${count} times: ${why}`,
        startFailures: count,
      }
    : { ...rest, state: 'pending', startFailures: count };
}

/**
 * `tasks` with each running one settled by its worker (CONTEXT.md, Task): a `done` report makes
 * it `succeeded`, `failed` makes it `failed` with the report's text as `reason`; a worker that
 * ended with neither fails it `ended without a report`; `blocked` and questions leave it running.
 * A claim whose worker never opened within the grace counts as a failed start (the mesa that
 * claimed it was killed). Then `pending` and `ready` are worked out (withStates).
 */
export function settle(
  tasks: readonly Task[],
  newsOf: (worker: string) => WorkerNews,
  now: Date,
): Task[] {
  return withStates(
    tasks.map((task) => {
      if (task.state !== 'running') return task;
      if (!task.worker) {
        const since = Date.parse(task.startedAt ?? task.createdAt);
        return now.getTime() - since > START_GRACE_MS
          ? failedStart(task, 'its worker never opened')
          : task;
      }
      const news = newsOf(task.worker);
      if (news.report?.kind === 'done') return { ...task, state: 'succeeded' };
      if (news.report?.kind === 'failed')
        return { ...task, state: 'failed', reason: news.report.message };
      return news.ended ? { ...task, state: 'failed', reason: 'ended without a report' } : task;
    }),
  );
}
