import { z } from 'zod';
import type { Clock } from '../lib/clock.js';
import { MesaError } from '../lib/result.js';
import type { Config } from '../profile/config.js';
import { namesOf, rulesBackend, toAnswer } from './rules.js';
import {
  type Answer,
  AnswerSchema,
  type Backend,
  type Decision,
  type DecisionRecorder,
  type Question,
  QuestionsSchema,
} from './types.js';

/** What Faro reads from the profile: `decisions.backend` and `.threshold`. */
export type FaroProfile = Pick<Config, 'decisions'>;

export type FaroDeps<S> = {
  /** The backends this decision site can use; its rules backend among them, or an even one. */
  backends: readonly Backend<S>[];
  profile: FaroProfile;
  clock: Clock;
  recorder?: DecisionRecorder;
};

const rulesOf = <S>(backends: readonly Backend<S>[]) =>
  backends.find((b) => b.name === 'rules') ?? rulesBackend<S>([]);

/** The backend the profile names, if this site has it, else rules. */
export function selectBackend<S>(backends: readonly Backend<S>[], profile: FaroProfile) {
  return backends.find((b) => b.name === profile.decisions.backend) ?? rulesOf(backends);
}

/** A backend's answers, used only when they answer exactly these questions, in order. */
function checked(questions: Question[], raw: unknown): Answer[] {
  const answers = z.array(AnswerSchema).length(questions.length).parse(raw);
  const fits = (q: Question, a: Answer) => {
    if (a.id !== q.id || a.kind !== q.kind) return false;
    if (q.kind === 'Noul' || a.kind === 'Noul') return true;
    const names = namesOf(q);
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

const Reply = z.union([
  z.array(z.unknown()),
  z.object({ answers: z.array(z.unknown()), costUsd: z.number().optional() }),
]);

type Attempt<S> =
  | { backend: Backend<S>; answers: Answer[]; costUsd?: number | undefined }
  | { failed: string };

async function attempt<S>(
  backend: Backend<S>,
  state: S,
  questions: Question[],
): Promise<Attempt<S>> {
  try {
    const reply = Reply.parse(await backend.answer(state, questions));
    const [raw, costUsd] = Array.isArray(reply) ? [reply] : [reply.answers, reply.costUsd];
    return { backend, answers: checked(questions, raw), costUsd };
  } catch (error) {
    return { failed: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Faro: answers `questions` about `state`, one answer per question with its probabilities and
 * confidence. The site's rules answer first; the backend the profile names is asked only when
 * the least sure answer is below `decisions.threshold` (ADR-0003), and its answers stand only if
 * they are well formed; when it fails, the rules' answers stand as `rules-fallback`. Rules that
 * fail give even answers. Questions are validated here too, as
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
  const first = await attempt(rules, state, asked);
  const ruled =
    'failed' in first
      ? { backend: rules, answers: asked.map((q) => toAnswer(q, undefined)), costUsd: undefined }
      : first;
  let made: Exclude<Attempt<S>, { failed: string }> & { fellBack?: string } = ruled;
  const named = selectBackend(deps.backends, deps.profile);
  const unsure = Math.min(...ruled.answers.map(certainty)) < deps.profile.decisions.threshold;
  if (named !== rules && unsure) {
    const second = await attempt(named, state, asked);
    made = 'failed' in second ? { ...ruled, fellBack: second.failed } : second;
  }
  const decision: Decision = {
    questions: asked,
    answers: made.answers,
    backend: made.fellBack === undefined ? made.backend.name : 'rules-fallback',
    ...(made.fellBack === undefined ? {} : { fallbackReason: made.fellBack }),
    ...(made.costUsd === undefined ? {} : { costUsd: made.costUsd }),
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
