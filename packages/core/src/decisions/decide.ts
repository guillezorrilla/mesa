import { z } from 'zod';
import type { Clock } from '../clock.js';
import type { Config } from '../config.js';
import { MesaError } from '../result.js';
import { rulesBackend, toAnswer } from './rules.js';
import {
  type Answer,
  AnswerSchema,
  type Backend,
  type Decision,
  type DecisionRecorder,
  type Question,
  QuestionsSchema,
} from './types.js';

/** What Faro reads from the profile: `decisions.backend` and `.threshold`, and whether a key is set. */
export type FaroProfile = Pick<Config, 'decisions'> & { hasKey: (name: string) => boolean };

export type FaroDeps<S> = {
  /** The backends this decision site can use; its rules backend among them, or an even one. */
  backends: readonly Backend<S>[];
  profile: FaroProfile;
  clock: Clock;
  recorder?: DecisionRecorder;
};

const rulesOf = <S>(backends: readonly Backend<S>[]) =>
  backends.find((b) => b.name === 'rules') ?? rulesBackend<S>([]);

/**
 * The backend the profile names, if this site has it, else rules. ADR-0004: `jev` is a paid API,
 * used only with a `jev` key; `adapter` runs on the Claude subscription (its amendment).
 */
export function selectBackend<S>(backends: readonly Backend<S>[], profile: FaroProfile) {
  const named = profile.decisions.backend;
  if (named === 'jev' && !profile.hasKey('jev')) return rulesOf(backends);
  return backends.find((b) => b.name === named) ?? rulesOf(backends);
}

/** A backend's answers, used only when they answer exactly these questions, in order. */
function checked(questions: Question[], raw: unknown): Answer[] {
  const answers = z.array(AnswerSchema).length(questions.length).parse(raw);
  const fits = (q: Question, a: Answer) => {
    if (a.id !== q.id || a.kind !== q.kind) return false;
    if (q.kind === 'Noul' || a.kind === 'Noul') return true;
    const names = q.kind === 'Choice' ? q.options : q.levels;
    const ps = Object.values(a.probabilities);
    return (
      ps.length === names.length &&
      names.every((n) => Object.hasOwn(a.probabilities, n)) &&
      Math.abs(ps.reduce((x, y) => x + y, 0) - 1) < 1e-6 &&
      (a.kind === 'Score' || names.includes(a.answer))
    );
  };
  if (!questions.every((q, i) => answers[i] && fits(q, answers[i]))) {
    throw new MesaError('internal', 'the backend answered other questions');
  }
  return answers;
}

/**
 * How sure an answer is: a Choice's confidence, or how far a Noul leans. A Score's spread over
 * its levels is its answer (a position between them), not doubt, so it never counts as unsure.
 */
const certainty = (a: Answer) =>
  a.kind === 'Noul'
    ? Math.max(a.probabilities, 1 - a.probabilities)
    : a.kind === 'Choice'
      ? a.confidence
      : 1;

async function attempt<S>(backend: Backend<S>, state: S, questions: Question[]) {
  try {
    return { backend, answers: checked(questions, await backend.answer(state, questions)) };
  } catch {
    // ponytail: the reason is dropped; keep it in the Decision when the adapter (#26) lands.
    return undefined;
  }
}

/**
 * Faro: answers `questions` about `state`, one answer per question with its probabilities and
 * confidence. The site's rules answer first; the backend the profile names is asked only when
 * the least sure answer is below `decisions.threshold` (ADR-0003), and its answers stand only if
 * they are well formed. Rules that fail give even answers. Questions are validated here too, as
 * callers at a boundary pass what they read: invalid ones are a usage error.
 */
export async function decide<S>(
  deps: FaroDeps<S>,
  state: S,
  questions: readonly Question[],
): Promise<Decision> {
  const parsed = QuestionsSchema.safeParse(questions);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join('.') || '(root)';
    throw new MesaError('usage', `invalid questions: ${where}: ${issue?.message}`);
  }
  const asked = parsed.data;
  const started = deps.clock();
  const rules = rulesOf(deps.backends);
  let made = (await attempt(rules, state, asked)) ?? {
    backend: rules,
    answers: asked.map((q) => toAnswer(q, undefined)),
  };
  const named = selectBackend(deps.backends, deps.profile);
  const unsure = Math.min(...made.answers.map(certainty)) < deps.profile.decisions.threshold;
  if (named !== rules && unsure) made = (await attempt(named, state, asked)) ?? made;
  const decision: Decision = {
    questions: asked,
    answers: made.answers,
    backend: made.backend.name,
    at: started.toISOString(),
    latencyMs: deps.clock().getTime() - started.getTime(),
  };
  try {
    await deps.recorder?.record(decision);
  } catch {
    // ponytail: a record never fails the decision it keeps (docs/receipts.md); P3's receipt
    // recorder surfaces its failure as the action's receipt warning.
  }
  return decision;
}
