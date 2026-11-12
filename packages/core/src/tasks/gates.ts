import type { MesaContext } from '../context.js';
import type { Evaluation } from '../decisions/evaluate.js';
import { ON_DEMAND_MS } from '../decisions/models.js';
import type { DecisionRequest } from '../decisions/request.js';
import { shortId } from '../lib/ids.js';
import { MesaError } from '../lib/result.js';
import { taskTitle } from '../sessions/record/labels.js';
import { callerOf } from '../sessions/window/caller.js';
import { type GateAdvice, gateAdvice, gateRequest } from './gate-advice.js';
import { type Gate, isLive, type ResolvedGate } from './task-file.js';
import { taskStore } from './task-store.js';

const QUESTION_CHARS = 1_000;
const OPTION_CHARS = 80;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 8;

export type GatesDeps = {
  /** Tells `coordinator` how a person resolved `gate` on its task: a `gate` child report. */
  report: (gate: ResolvedGate, coordinator: string) => void;
  /** Decision assistance's on-demand evaluate for `session`, ending by the clock time `until`. */
  evaluate: (request: DecisionRequest, session: string, until: number) => Promise<Evaluation>;
};

/** A gate the Inbox shows: open, with its task's coordinator. */
export type OpenGate = Gate & { coordinator?: string };

/**
 * Decision gates on tasks (CONTEXT.md, Decision gate), kept in `tasks.json` beside them: an agent
 * opens one, the task reads `blocked` until a person resolves it, and the task's coordinator
 * hears the choice as a `gate` report. No Faro decision site: the person chooses.
 */
export function gatesService(ctx: MesaContext, deps: GatesDeps) {
  const store = taskStore(ctx);
  const caller = () => callerOf({ store: ctx.store, env: ctx.env, profileName: ctx.profile });
  /**
   * The open gates on tasks not over, with each task's coordinator: read without the lock, as the
   * Inbox reads it inside its own. A gate whose task settled first asks nothing any more.
   */
  const open = (): OpenGate[] => {
    const file = store.peek();
    const tasks = new Map(file.tasks.map((t) => [t.id, t]));
    return file.gates.flatMap((g) => {
      const task = tasks.get(g.task);
      if (g.resolvedAt || !task || !isLive(task)) return [];
      return [task.coordinator ? { ...g, coordinator: task.coordinator } : g];
    });
  };
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
        if (!isLive(found))
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
    /**
     * Open gate `id` with its task's title and the Decision model's advice on its options, asked
     * at the next-step site for the task's coordinator within `withinMs` (advice only, kept
     * nowhere; CONTEXT.md, Decision gate). With no model, no coordinator, or one no longer live,
     * the advice is unavailable and says why. An unknown or resolved gate is not_found.
     */
    advise: async (
      id: string,
      withinMs = ON_DEMAND_MS,
    ): Promise<OpenGate & { title: string; advice: GateAdvice }> => {
      const gate = open().find((g) => g.id === id);
      if (!gate) throw new MesaError('not_found', `no open gate ${id}; see mesa gates`);
      const task = store.peek().tasks.find((t) => t.id === gate.task);
      const title = task ? taskTitle(task.spec) : gate.task;
      const unavailable = (reason: string) => ({
        status: 'unavailable' as const,
        odds: [],
        reason,
      });
      if (!gate.coordinator)
        return { ...gate, title, advice: unavailable('the task has no coordinator') };
      try {
        const asked = { question: gate.question, options: gate.options, task: title };
        const until = ctx.clock().getTime() + withinMs;
        const evaluation = await deps.evaluate(gateRequest(asked), gate.coordinator, until);
        return { ...gate, title, advice: gateAdvice(gate, evaluation) };
      } catch (error) {
        if (!(error instanceof MesaError)) throw error;
        return { ...gate, title, advice: unavailable(error.message) };
      }
    },
    /** The open gates, oldest first, `task`'s only when given. */
    list: (task?: string) => ({
      gates: open().filter((g) => task === undefined || g.task === task),
    }),
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
