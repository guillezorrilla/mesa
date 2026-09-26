import type { Answer, Choice, Question, Score } from './types.js';

/**
 * How a rule weighs one question: a weight per option (Choice) or level (Score), normalised to
 * probabilities here, or the probability that a Noul's statement holds.
 */
export type Weights = Readonly<Record<string, number>> | number;

/** One rule of the rules backend: when it holds for the state, it weighs questions by id. */
type Rule<S> = {
  when: (state: S) => boolean;
  answer: (questions: Question[], state: S) => Readonly<Record<string, Weights>>;
};

/** A Choice's options or a Score's levels: what its probabilities are over. */
export const namesOf = (q: Choice | Score) => (q.kind === 'Choice' ? q.options : q.levels);

/** A usable weight, or 0: a negative, non-finite, or missing weight counts for nothing. */
const weight = (w: Weights | undefined, name: string) => {
  const value = typeof w === 'object' && Object.hasOwn(w, name) ? w[name] : 0;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
};

/**
 * The answer `weights` give `question`. Weights are normalised (all zero is even); the Choice is
 * the likeliest option; the Score is the probability-weighted position from 0 (lowest level) to
 * 1 (highest); confidence is the top probability. A Noul without a probability is 0.5.
 */
export function toAnswer(question: Question, weights: Weights | undefined): Answer {
  if (question.kind === 'Noul') {
    const p = typeof weights === 'number' && !Number.isNaN(weights) ? weights : 0.5;
    const probability = Math.min(1, Math.max(0, p));
    return { id: question.id, kind: 'Noul', answer: probability > 0.5, probabilities: probability };
  }
  const names = namesOf(question);
  // Scaled by the largest first, so huge weights cannot overflow the total.
  const top = Math.max(...names.map((n) => weight(weights, n)));
  const raw = names.map((n) => (top > 0 ? weight(weights, n) / top : 1));
  const total = raw.reduce((a, b) => a + b, 0);
  const ps = raw.map((w) => w / total);
  const probabilities = Object.fromEntries(names.map((n, i) => [n, ps[i] ?? 0]));
  const confidence = Math.max(...ps);
  if (question.kind === 'Choice') {
    const answer = names[ps.indexOf(confidence)] ?? names[0] ?? '';
    return { id: question.id, kind: 'Choice', answer, probabilities, confidence };
  }
  const answer = ps.reduce((sum, p, i) => sum + (p * i) / (names.length - 1), 0);
  return { id: question.id, kind: 'Score', answer, probabilities, confidence };
}

/** The rules backend: a Backend (it fits one) whose answers are always well formed. */
type RulesBackend<S> = {
  name: 'rules';
  answer: (state: S, questions: Question[]) => Promise<Answer[]>;
};

/**
 * The deterministic backend (ADR-0004), always available: the first rule whose `when` holds
 * weighs the questions, over `fallback`'s weights for those it leaves out; a question neither
 * weighs is even.
 */
export function rulesBackend<S>(
  rules: readonly Rule<S>[],
  fallback: Rule<S>['answer'] = () => ({}),
): RulesBackend<S> {
  return {
    name: 'rules',
    answer: async (state, questions) => {
      const rule = rules.find((r) => r.when(state));
      const weights = { ...fallback(questions, state), ...rule?.answer(questions, state) };
      return questions.map((q) =>
        toAnswer(q, Object.hasOwn(weights, q.id) ? weights[q.id] : undefined),
      );
    },
  };
}
