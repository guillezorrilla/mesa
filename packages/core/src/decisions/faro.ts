import type { MesaContext } from '../context.js';
import { redactPayload } from '../lib/redact.js';
import { readProjectFile } from '../projects/project-file.js';
import { readRegistry } from '../projects/registry.js';
import { adapterBackend } from './adapter.js';
import { decide, type FaroProfile } from './decide.js';
import {
  checkGuardrail,
  type Guarded,
  type GuardrailDeps,
  type Overrides,
  passGuardrail,
} from './guardrail.js';
import { rulesBackend } from './rules.js';
import type { DecisionRecorder, Question } from './types.js';

/**
 * Faro for one profile: the shared backends, the profile's view of them, `mesa decide`, and the
 * guardrail.
 */
export function createFaro(ctx: MesaContext) {
  const { deps } = ctx;
  /** Faro's shared backends, asked when a decision site's own rules are unsure. */
  const shared = [
    adapterBackend<unknown>({
      run: deps.run,
      redact: (value, maxString) => redactPayload(value, deps.home, ctx.secrets(), maxString),
    }),
  ];
  /** For questions no rules know (mesa decide), the rules answer evenly. */
  const outside = [rulesBackend<unknown>([]), ...shared];
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
    shared,
    profile: profile(),
    clock: deps.clock,
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
    shared,
    profile,
    /**
     * Faro, for questions from outside (mesa decide): no rules know them, so the rules backend
     * answers evenly. Decision sites bring their own rules backend.
     */
    decide: (state: unknown, questions: unknown) =>
      // decide validates what it is given: this is the boundary it checks.
      decide(
        { backends: outside, profile: profile(), clock: deps.clock },
        state,
        questions as Question[],
      ),
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
