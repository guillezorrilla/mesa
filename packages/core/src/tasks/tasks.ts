import type { MesaContext } from '../context.js';
import { shortId } from '../lib/ids.js';
import { changeJson } from '../lib/json-file.js';
import { MesaError } from '../lib/result.js';
import type { SessionRecord } from '../sessions/record/record.js';
import { callerOf } from '../sessions/window/caller.js';
import {
  failedStart,
  isOpen,
  settle,
  type Task,
  TaskFile,
  type WorkerNews,
  withStates,
} from './task-file.js';

export type { Task, TaskState } from './task-file.js';

/** A task with each dep's spec and state, as `mesa tasks show` gives it. */
export type ShownTask = Task & {
  dependencies: Pick<Task, 'id' | 'spec' | 'state'>[];
  /** For a pending task, the dep that holds it: the first that has not succeeded. */
  heldBy?: string;
};

/** A graph name a person can type: letters, digits, dots, dashes and underscores. */
const GRAPH = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SPEC_CHARS = 4_000;

export type CreateTask = { graph?: string; deps?: readonly string[]; coordinator?: string };

/** What `mesa worker --task` takes beside the task: where, and how, its worker opens. */
export type TaskStart = { agent?: string; branch?: string; parent?: string };

export type TasksDeps = {
  /** Opens a worker with `spec` as its goal (the sessions' `worker`), returning its record. */
  startWorker: (
    project: string | undefined,
    spec: string,
    flags: TaskStart,
  ) => Promise<SessionRecord>;
  /** A worker's newest explicit report (`mesa report`), delivered or not. */
  reportOf: (worker: string) => WorkerNews['report'];
};

const notFound = (id: string) => new MesaError('not_found', `no task ${id}; see mesa tasks`);

/**
 * The profile's tasks, `tasks.json`, changed under the profile lock so two processes both keep
 * theirs (CONTEXT.md, Task graph). Every read settles running tasks by their workers' reports and
 * endings first (settle), so a dependent is ready as soon as anyone looks.
 */
export function tasksService(ctx: MesaContext, deps: TasksDeps) {
  const file = ctx.paths.tasks;
  const newsOf = (worker: string): WorkerNews => {
    const record = ctx.store.find(worker);
    const report = deps.reportOf(worker);
    return { ...(report ? { report } : {}), ended: !record || Boolean(record.endedAt) };
  };
  /** Changes the settled tasks under the lock with `fn`, which returns the next ones and a result. */
  const change = <R>(fn: (tasks: Task[]) => { tasks: Task[]; result: R }): R => {
    let result: R | undefined;
    changeJson(
      file,
      TaskFile,
      (current) => {
        const changed = fn(settle(current?.tasks ?? [], newsOf, ctx.clock()));
        result = changed.result;
        return { tasks: changed.tasks };
      },
      ctx,
    );
    return result as R;
  };
  const all = () => change((tasks) => ({ tasks, result: tasks }));
  /** Replaces task `id` with what `fn` makes of it, then works out the states; not_found for an unknown id. */
  const update = (id: string, fn: (task: Task) => Task) =>
    change((tasks) => {
      const found = tasks.find((t) => t.id === id);
      if (!found) throw notFound(id);
      const next = withStates(tasks.map((t) => (t.id === id ? fn(found) : t)));
      return { tasks: next, result: next.find((t) => t.id === id) as Task };
    });
  return {
    /**
     * Writes a new task and returns it: `ready` when every dep has succeeded (or it has none),
     * else `pending`. Its coordinator is `coordinator` (not_found for an unknown session), else
     * the Caller's session. An unknown dep is not_found and writes nothing.
     */
    create: (spec: string, opts: CreateTask = {}): Task => {
      const text = spec.trim();
      if (!text) throw new MesaError('usage', 'say what the task is');
      if (text.length > SPEC_CHARS)
        throw new MesaError('usage', `a task spec is at most ${SPEC_CHARS} characters`);
      const graph = opts.graph ?? 'default';
      if (!GRAPH.test(graph))
        throw new MesaError(
          'usage',
          `graph ${graph}: use letters, digits, dots, dashes, underscores`,
        );
      if (opts.coordinator !== undefined && !ctx.store.find(opts.coordinator))
        throw new MesaError('not_found', `no session ${opts.coordinator}; see mesa sessions`);
      const coordinator =
        opts.coordinator ??
        callerOf({ store: ctx.store, env: ctx.env, profileName: ctx.profile }).session?.id;
      const wanted = [...new Set(opts.deps ?? [])];
      return change((tasks) => {
        const states = new Map(tasks.map((t) => [t.id, t.state]));
        const unknown = wanted.filter((dep) => !states.has(dep));
        if (unknown.length)
          throw new MesaError('not_found', `no task ${unknown.join(', ')}; see mesa tasks`);
        const made: Task = {
          id: `t-${shortId(ctx.newId)}`,
          spec: text,
          graph,
          deps: wanted,
          state: wanted.every((dep) => states.get(dep) === 'succeeded') ? 'ready' : 'pending',
          ...(coordinator ? { coordinator } : {}),
          createdAt: ctx.clock().toISOString(),
        };
        return { tasks: [...tasks, made], result: made };
      });
    },
    /** The tasks, oldest first: `graph`'s only, and only `ready` ones with `ready`. */
    list: ({ graph, ready = false }: { graph?: string; ready?: boolean } = {}) => ({
      tasks: all().filter(
        (t) => (graph === undefined || t.graph === graph) && (!ready || t.state === 'ready'),
      ),
    }),
    /** One task with each dep's spec and state, and the dep holding it; not_found for an unknown id. */
    show: (id: string): ShownTask => {
      const byId = new Map(all().map((t) => [t.id, t]));
      const task = byId.get(id);
      if (!task) throw notFound(id);
      // flatMap: tasks are never removed, so each dep is found; none is dropped.
      const dependencies = task.deps.flatMap((dep) => {
        const found = byId.get(dep);
        return found ? [{ id: found.id, spec: found.spec, state: found.state }] : [];
      });
      const holding = dependencies.find((d) => d.state !== 'succeeded');
      return {
        ...task,
        dependencies,
        ...(task.state === 'pending' && holding ? { heldBy: holding.id } : {}),
      };
    },
    /**
     * Starts ready task `id` with a worker (`mesa worker --task`): claims it `running` under the
     * lock, so two starts at once start it once, opens the worker with its spec as the goal, and
     * records each on the other (`worker` here, `task` on the session). A start whose session
     * never opens puts the task back and counts it; the third in a row fails it (failedStart).
     */
    start: async (id: string, project: string | undefined, flags: TaskStart = {}) => {
      const claimed = update(id, (task) => {
        if (task.state !== 'ready')
          throw new MesaError('usage', `task ${id} is ${task.state}, not ready`);
        return { ...task, state: 'running', startedAt: ctx.clock().toISOString() };
      });
      let worker: SessionRecord;
      try {
        worker = await deps.startWorker(project, claimed.spec, flags);
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error);
        update(id, (task) => failedStart(task, why));
        throw error;
      }
      ctx.store.update(worker.id, { task: id });
      const task = update(id, ({ startFailures: _count, ...rest }) => ({
        ...rest,
        worker: worker.id,
      }));
      return { task, worker };
    },
    /**
     * Returns a failed or cancelled task to waiting (`ready` or `pending`, as its deps say),
     * clearing its worker, reason and failed starts.
     */
    retry: (id: string) =>
      update(id, (task) => {
        if (task.state !== 'failed' && task.state !== 'cancelled')
          throw stateError(task, 'retry', 'failed or cancelled');
        const { worker: _w, reason: _r, startFailures: _c, startedAt: _s, ...rest } = task;
        return { ...rest, state: 'pending' };
      }),
    /** Cancels a pending or ready task. */
    cancel: (id: string) =>
      update(id, (task) => {
        if (!isOpen(task)) throw stateError(task, 'cancel', 'pending or ready');
        return { ...task, state: 'cancelled' };
      }),
  };
}

function stateError(task: Task, verb: string, wanted: string) {
  if (task.state === 'running')
    return new MesaError(
      'usage',
      `task ${task.id} is running; stop its worker first: mesa stop ${task.worker ?? '<worker>'}`,
    );
  return new MesaError('usage', `${verb} takes a ${wanted} task; ${task.id} is ${task.state}`);
}
