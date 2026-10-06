import type { MesaContext } from '../context.js';
import { redactPayload } from '../lib/redact.js';
import { MesaError } from '../lib/result.js';
import { readProjectFile } from '../projects/project-file.js';
import { readRegistry } from '../projects/registry.js';
import { recordScope } from '../receipts/record-scope.js';
import { recordAgent } from '../sessions/record.js';
import { decide, type FaroProfile } from './decide.js';
import {
  checkGuardrail,
  type Guarded,
  type GuardrailDeps,
  type Overrides,
  passGuardrail,
} from './guardrail.js';
import { rulesBackend } from './rules.js';
import type { Decision, DecisionRecorder, Question } from './types.js';

/** Faro for one profile: the profile's view of it, `mesa decide`, and the guardrail. */
export function createFaro(ctx: MesaContext) {
  /** For questions no rules know (mesa decide), the rules answer evenly. */
  const outside = [rulesBackend<unknown>([])];
  /** Faro's view of the profile; before init, rules only (nothing else is configured). */
  const profile = (): FaroProfile => ({
    decisions: ctx.configIfAny()?.decisions ?? { backend: 'rules', threshold: 1 },
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
  return {
    profile,
    /**
     * Faro, for questions from outside (mesa decide): no rules know them, so the rules backend
     * answers evenly. Decision sites bring their own rules backend. It writes a decision receipt:
     * the answers in its `decisions`, what it was asked (redacted) in its `inputs`, and the
     * backend's list price, if it reports one, as its `cost`.
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
            ...(d.fallbackReason ? { fallbackReason: redact(d.fallbackReason) } : {}),
          }),
          cost: (d) => d.costUsd,
        },
        (recorder) =>
          // decide validates what it is given: this is the boundary it checks.
          decide(
            { backends: outside, profile: profile(), clock: ctx.clock, recorder },
            state,
            questions as Question[],
          ),
      );
    },
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
    /** The backend the profile names and its threshold, for doctor; none before init. */
    inUse: () => {
      const decisions = ctx.configIfAny()?.decisions;
      return decisions && { named: decisions.backend, threshold: decisions.threshold };
    },
  };
}

export type Faro = ReturnType<typeof createFaro>;
