import { z } from 'zod';

// The profile's tasks as `tasks.json` holds them (CONTEXT.md, Task), and how a read settles them.

/**
 * Where a task stands: `pending` while a dep has not succeeded, `ready` to start (no deps, or all
 * succeeded), `running` with a worker, then `succeeded`, `failed` or `cancelled`. `blocked` is how
 * a waiting or running task reads while it has an open gate (withGates); it is never written.
 */
const TASK_STATES = [
  'pending',
  'ready',
  'running',
  'blocked',
  'succeeded',
  'failed',
  'cancelled',
] as const;
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

/**
 * A decision only a person makes on a task (CONTEXT.md, Decision gate): open until resolved with
 * one of its `options`, which records the `option` and when.
 */
const GateSchema = z.strictObject({
  id: z.string(),
  task: z.string(),
  question: z.string(),
  options: z.array(z.string()),
  /** The session that opened it: the Caller's; none from a person outside a Mesa window. */
  by: z.string().optional(),
  at: z.iso.datetime(),
  option: z.string().optional(),
  resolvedAt: z.iso.datetime().optional(),
});
export type Gate = z.infer<typeof GateSchema>;
/** A gate a person resolved. */
export type ResolvedGate = Gate & { option: string; resolvedAt: string };

export const TaskFile = z
  .strictObject({
    tasks: z.array(TaskSchema).default([]),
    /** Every gate, open and resolved, oldest first. */
    gates: z.array(GateSchema).default([]),
  })
  .describe('task graphs');
export type TaskFile = z.infer<typeof TaskFile>;

/** Whether `task` is over: no worker will change it any more (`succeeded`, `failed`, `cancelled`). */
export const isSettled = (task: Pick<Task, 'state'>) =>
  task.state === 'succeeded' || task.state === 'failed' || task.state === 'cancelled';

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

/** Whether `task` is not over: waiting or running, so an open gate blocks it. */
export const isLive = (task: Pick<Task, 'state'>) => isOpen(task) || task.state === 'running';

/**
 * `tasks` as they read: a waiting or running one with an open gate in `gates` is `blocked`, so no
 * start takes it; its worker, if any, keeps running. Never written: a resolve returns it to the
 * state it has underneath.
 */
export function withGates(tasks: readonly Task[], gates: readonly Gate[]): Task[] {
  const gated = new Set(gates.filter((g) => !g.resolvedAt).map((g) => g.task));
  return tasks.map((task) =>
    gated.has(task.id) && isLive(task) ? { ...task, state: 'blocked' } : task,
  );
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
