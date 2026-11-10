import type { MesaContext } from '../context.js';
import { shortId } from '../lib/ids.js';
import { MesaError } from '../lib/result.js';
import { callerOf } from '../sessions/window/caller.js';
import type { Gate, Task } from './task-file.js';
import { taskStore } from './task-store.js';

const QUESTION_CHARS = 1_000;
const OPTION_CHARS = 80;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 8;

export type GatesDeps = {
  /** Tells `coordinator` how a person resolved `gate` on its task: a `gate` child report. */
  report: (gate: Gate & { option: string; resolvedAt: string }, coordinator: string) => void;
};

/** A gate the Inbox shows: open, with its task's coordinator. */
export type OpenGate = Gate & { coordinator?: string };

const settled = (task: Task) =>
  task.state === 'succeeded' || task.state === 'failed' || task.state === 'cancelled';

/**
 * Decision gates on tasks (CONTEXT.md, Decision gate), kept in `tasks.json` beside them: an agent
 * opens one, the task reads `blocked` until a person resolves it, and the task's coordinator
 * hears the choice as a `gate` report. No Faro decision site: the person chooses.
 */
export function gatesService(ctx: MesaContext, deps: GatesDeps) {
  const store = taskStore(ctx);
  const caller = () => callerOf({ store: ctx.store, env: ctx.env, profileName: ctx.profile });
  const open = () =>
    store.change((file) => {
      const coordinators = new Map(file.tasks.map((t) => [t.id, t.coordinator]));
      const gates: OpenGate[] = file.gates
        .filter((g) => !g.resolvedAt)
        .map((g) => {
          const coordinator = coordinators.get(g.task);
          return coordinator ? { ...g, coordinator } : g;
        });
      return { next: file, result: gates };
    });
  return {
    /**
     * Opens a gate on task `task` with `question` and two to eight distinct `options`, by the
     * Caller's session. An unknown task is not_found; a settled one, or bad options, a usage error.
     */
    create: (task: string, question: string, options: readonly string[]): Gate => {
      const text = question.trim();
      if (!text) throw new MesaError('usage', 'say what the person must decide');
      if (text.length > QUESTION_CHARS)
        throw new MesaError('usage', `a gate question is at most ${QUESTION_CHARS} characters`);
      const offered = options.map((o) => o.trim());
      if (offered.length < MIN_OPTIONS || offered.length > MAX_OPTIONS)
        throw new MesaError('usage', `offer ${MIN_OPTIONS} to ${MAX_OPTIONS} options`);
      if (offered.some((o) => !o || o.length > OPTION_CHARS))
        throw new MesaError('usage', `each option is 1 to ${OPTION_CHARS} characters`);
      if (new Set(offered).size !== offered.length)
        throw new MesaError('usage', 'each option must differ from the others');
      const by = caller().session?.id;
      return store.change((file) => {
        const found = file.tasks.find((t) => t.id === task);
        if (!found) throw new MesaError('not_found', `no task ${task}; see mesa tasks`);
        if (settled(found))
          throw new MesaError('usage', `task ${task} is ${found.state}; a gate needs a live task`);
        const gate: Gate = {
          id: `g-${shortId(ctx.newId)}`,
          task,
          question: text,
          options: offered,
          ...(by ? { by } : {}),
          at: ctx.clock().toISOString(),
        };
        return { next: { ...file, gates: [...file.gates, gate] }, result: gate };
      });
    },
    /** The open gates, oldest first, `task`'s only when given. */
    list: (task?: string) => ({
      gates: open().filter((g) => task === undefined || g.task === task),
    }),
    /** The open gates with their task's coordinator, for the Inbox. */
    open,
    /**
     * Resolves open gate `id` with `option`, outside a Mesa window only: a person decides. Records
     * the option and when, and reports it to the task's coordinator. An unknown id is not_found;
     * an option not offered, or a resolved gate, a usage error.
     */
    resolve: (id: string, option: string) => {
      if (caller().inMesaWindow)
        throw new MesaError(
          'usage',
          'only a person resolves a gate: run it outside a Mesa window or use the app',
        );
      const { gate, coordinator } = store.change((file) => {
        const found = file.gates.find((g) => g.id === id);
        if (!found) throw new MesaError('not_found', `no gate ${id}; see mesa gates`);
        if (found.resolvedAt)
          throw new MesaError('usage', `gate ${id} was resolved at ${found.resolvedAt}`);
        if (!found.options.includes(option))
          throw new MesaError(
            'usage',
            `gate ${id} offers ${found.options.join(', ')}, not ${option}`,
          );
        const resolved = { ...found, option, resolvedAt: ctx.clock().toISOString() };
        return {
          next: { ...file, gates: file.gates.map((g) => (g.id === id ? resolved : g)) },
          result: {
            gate: resolved,
            coordinator: file.tasks.find((t) => t.id === found.task)?.coordinator,
          },
        };
      });
      if (coordinator) deps.report(gate, coordinator);
      return gate;
    },
  };
}
