import { z } from 'zod';
import type { MesaContext } from '../context.js';
import { shortId } from '../lib/ids.js';
import { changeJson, readJson } from '../lib/json-file.js';
import { MesaError } from '../lib/result.js';
import { callerOf } from '../sessions/window/caller.js';

/**
 * Where a task stands (CONTEXT.md, Task): `pending` while a dep has not succeeded, `ready` to
 * start (no deps, or all succeeded), `running` with a worker, then `succeeded`, `failed` or
 * `cancelled`.
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
});
export type Task = z.infer<typeof TaskSchema>;

/** A task with each dep's spec and state, as `mesa tasks show` gives it. */
export type ShownTask = Task & { dependencies: Pick<Task, 'id' | 'spec' | 'state'>[] };

const State = z.strictObject({ tasks: z.array(TaskSchema).default([]) }).describe('task graphs');

/** A graph name a person can type: letters, digits, dots, dashes and underscores. */
const GRAPH = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SPEC_CHARS = 4_000;

export type CreateTask = { graph?: string; deps?: readonly string[]; coordinator?: string };

/**
 * `tasks` with `pending` and `ready` worked out from their deps, never trusted from the file, so
 * a settled dep unlocks its dependents without anyone writing them. Deps are older than their
 * task (they existed when it was made), so one pass in file order sees each dep's state first.
 */
function withStates(tasks: readonly Task[]): Task[] {
  const states = new Map<string, TaskState>();
  return tasks.map((task) => {
    const open = task.state === 'pending' || task.state === 'ready';
    const state = !open
      ? task.state
      : task.deps.every((dep) => states.get(dep) === 'succeeded')
        ? 'ready'
        : 'pending';
    states.set(task.id, state);
    return state === task.state ? task : { ...task, state };
  });
}

/**
 * The profile's tasks, `tasks.json`, changed under the profile lock so two processes creating at
 * once both keep theirs (CONTEXT.md, Task graph).
 */
export function tasksService(ctx: MesaContext) {
  const file = ctx.paths.tasks;
  const all = () => withStates(readJson(file, State)?.tasks ?? []);
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
      const deps = [...new Set(opts.deps ?? [])];
      let made: Task | undefined;
      changeJson(
        file,
        State,
        (current) => {
          const tasks = current?.tasks ?? [];
          const states = new Map(withStates(tasks).map((t) => [t.id, t.state]));
          const unknown = deps.filter((dep) => !states.has(dep));
          if (unknown.length)
            throw new MesaError('not_found', `no task ${unknown.join(', ')}; see mesa tasks`);
          made = {
            id: `t-${shortId(ctx.newId)}`,
            spec: text,
            graph,
            deps,
            state: deps.every((dep) => states.get(dep) === 'succeeded') ? 'ready' : 'pending',
            ...(coordinator ? { coordinator } : {}),
            createdAt: ctx.clock().toISOString(),
          };
          return { tasks: [...tasks, made] };
        },
        ctx,
      );
      return made as Task;
    },
    /** The tasks, oldest first: `graph`'s only, and only `ready` ones with `ready`. */
    list: ({ graph, ready = false }: { graph?: string; ready?: boolean } = {}) => ({
      tasks: all().filter(
        (t) => (graph === undefined || t.graph === graph) && (!ready || t.state === 'ready'),
      ),
    }),
    /** One task with each dep's spec and state; not_found for an unknown id. */
    show: (id: string): ShownTask => {
      const byId = new Map(all().map((t) => [t.id, t]));
      const task = byId.get(id);
      if (!task) throw new MesaError('not_found', `no task ${id}; see mesa tasks`);
      return {
        ...task,
        // flatMap: tasks are never removed, so each dep is found; none is dropped.
        dependencies: task.deps.flatMap((dep) => {
          const found = byId.get(dep);
          return found ? [{ id: found.id, spec: found.spec, state: found.state }] : [];
        }),
      };
    },
  };
}
