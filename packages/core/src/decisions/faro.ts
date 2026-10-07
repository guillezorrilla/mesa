import type { MesaContext } from '../context.js';
import { redactPayload } from '../lib/redact.js';
import { MesaError } from '../lib/result.js';
import { readProjectFile } from '../projects/project-file.js';
import { readRegistry } from '../projects/registry.js';
import { recordScope } from '../receipts/record-scope.js';
import { recordAgent } from '../sessions/record/record.js';
import { decide, type FaroProfile } from './decide.js';
import {
  checkGuardrail,
  type Guarded,
  type GuardrailDeps,
  type Overrides,
  passGuardrail,
} from './guardrail.js';
import { type DecisionModels, ON_DEMAND_MS } from './models.js';
import { rulesBackend } from './rules.js';
import type { Decision, DecisionRecorder, Question } from './types.js';

/**
 * Faro for one profile: the profile's view of it, `mesa decide`, and the guardrail. `models`
 * gives the hosted model the profile chose, if any.
 */
export function createFaro(ctx: MesaContext, models: Pick<DecisionModels, 'active'>) {
  /** Faro's view of the profile; before init, rules only (nothing else is configured). */
  const profile = (): FaroProfile => ({
    decisions: ctx.configIfAny()?.decisions ?? { model: 'none', threshold: 1 },
  });
  /**
   * The guardrail's deps, its decision going to `recorder`. A project's level is read from the
   * registry, not the config, so a config that does not read never loosens it; a project Mesa
   * cannot read has none.
   */
  const guard = (recorder?: DecisionRecorder): GuardrailDeps => ({
    profile: profile(),
    clock: ctx.clock,
    ...(recorder ? { recorder } : {}),
    secrets: ctx.secrets(),
    level: (project) => {
      try {
        const entry = readRegistry(ctx.paths.registry).find((e) => e.name === project);
        return entry && readProjectFile(entry.path).guardrail;
      } catch {
        return undefined;
      }
    },
  });
  /**
   * Questions no rules know: the rules answer evenly, and the chosen model, if any, is asked; an
   * abort of `signal` ends its request.
   */
  const askUnruled = (
    state: unknown,
    questions: Question[],
    deadlineMs: number,
    { recorder, signal }: { recorder?: DecisionRecorder; signal?: AbortSignal } = {},
  ) => {
    const model = models.active(deadlineMs);
    const { decisions } = profile();
    return decide(
      {
        backends: [rulesBackend<unknown>([]), ...(model ? [model] : [])],
        // Even answers are no rules' opinion: below any threshold, a Score's too.
        profile: { decisions: { ...decisions, threshold: Number.POSITIVE_INFINITY } },
        clock: ctx.clock,
        ...(recorder ? { recorder } : {}),
        ...(signal ? { signal } : {}),
      },
      state,
      questions,
    );
  };
  return {
    profile,
    /**
     * Faro, for questions from outside (mesa decide): no rules know them, so the rules backend
     * answers evenly, and the chosen model, if any, is always asked, within the on-demand
     * deadline. Decision sites bring their own rules backend. It writes a decision receipt: the
     * answers in its `decisions`, what it was asked (redacted) in its `inputs`, the model id that
     * answered in its `outputs`, and the backend's list price, if it reports one, as its `cost`.
     */
    decide: (
      state: unknown,
      questions: unknown,
      context: { project?: string; session?: string; rationale?: string } = {},
    ) => {
      const { project, session, actor } = recordScope(ctx, context);
      const rationale = context.rationale?.trim();
      if (project && !rationale)
        throw new MesaError('usage', 'a project decision needs a rationale');
      const redact = (value: unknown) => redactPayload(value, ctx.home, ctx.secrets());
      return ctx.record(
        {
          kind: 'decision',
          type: 'decision',
          summary: (d: Decision) =>
            `Faro answered ${d.answers.length} question${d.answers.length === 1 ? '' : 's'} (${d.backend})`,
          failure: 'Faro could not answer',
          project: () => project,
          session: () => session?.id,
          agent: () => (session ? recordAgent(session) : undefined),
          scope: { actor: actor?.id },
          inputs: {
            state: redact(state),
            questions: redact(questions),
            ...(rationale ? { rationale: redact(rationale) } : {}),
          },
          outputs: (d) => ({
            latencyMs: d.latencyMs,
            ...(d.model ? { model: d.model } : {}),
            ...(d.fallbackReason ? { fallbackReason: redact(d.fallbackReason) } : {}),
          }),
          cost: (d) => d.costUsd,
        },
        // decide validates what it is given: this is the boundary it checks.
        (recorder) => askUnruled(state, questions as Question[], ON_DEMAND_MS, { recorder }),
      );
    },
    /**
     * Faro for questions no rules know, within `deadlineMs`, recorded nowhere: what a decision
     * site asks for an ephemeral evaluation (evaluate.ts). An abort of `signal` ends the request.
     */
    ask: (
      state: unknown,
      questions: Question[],
      deadlineMs: number,
      options: { signal?: AbortSignal } = {},
    ) => askUnruled(state, questions, deadlineMs, options),
    guardrail: {
      /** The verdict on `text`, in `project` when given; recorded nowhere (mesa guardrail check). */
      check: (text: string, project?: string) =>
        checkGuardrail(guard(), {
          action: 'check',
          target: '',
          text,
          ...(project === undefined ? {} : { project }),
        }),
      /**
       * In front of an external action: goes on, or throws guardrail_blocked; the decision goes
       * to `recorder`, the action's receipt (passGuardrail).
       */
      gate: (input: Guarded, overrides: Overrides, recorder: DecisionRecorder) =>
        passGuardrail(guard(recorder), input, overrides),
    },
    /** The model the profile chose and its threshold, for doctor; none before init. */
    inUse: () => {
      const decisions = ctx.configIfAny()?.decisions;
      return decisions && { model: decisions.model, threshold: decisions.threshold };
    },
  };
}

export type Faro = ReturnType<typeof createFaro>;
