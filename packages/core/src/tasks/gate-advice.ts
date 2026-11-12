import type { Evaluation } from '../decisions/evaluate.js';
import type { DecisionRequest } from '../decisions/request.js';
import { clip } from '../lib/clip.js';

// A decision gate asked of the Decision model as a next-step choice among its options (advice
// only: the person still picks). Options are free text, so each goes as a slug `option-<n>`.

/**
 * The Decision model's advice on a gate: accepted, abstained or unavailable (with why), the
 * option it picks, and each option's probability in the gate's order, with what it gives to
 * deferring to the person.
 */
export type GateAdvice = {
  status: Evaluation['status'];
  pick?: string;
  odds: { option: string; p: number }[];
  defer?: number;
  model?: string;
  reason?: string;
};

type Asked = { question: string; options: readonly string[]; task: string };

const slug = (index: number) => `option-${index + 1}`;

/** The next-step request for a gate on task `task` (its title): options as candidates. */
export const gateRequest = (gate: Asked) =>
  ({
    site: 'next-step',
    candidates: gate.options.map((step, index) => ({ id: slug(index), step })),
    events: [clip(`A person must decide, for task "${gate.task}": ${gate.question}`, 300)],
  }) satisfies DecisionRequest;

/** `evaluation` read back onto the gate's options: the pick, each option's odds, and defer's. */
export function gateAdvice(gate: Pick<Asked, 'options'>, evaluation: Evaluation): GateAdvice {
  const probabilities =
    typeof evaluation.probabilities === 'object' ? evaluation.probabilities : undefined;
  const pick = gate.options.find((_, index) => evaluation.answer === slug(index));
  return {
    status: evaluation.status,
    ...(pick ? { pick } : {}),
    odds: probabilities
      ? gate.options.map((option, index) => ({ option, p: probabilities[slug(index)] ?? 0 }))
      : [],
    ...(probabilities?.defer === undefined ? {} : { defer: probabilities.defer }),
    ...(evaluation.model ? { model: evaluation.model } : {}),
    ...(evaluation.reason ? { reason: evaluation.reason } : {}),
  };
}
