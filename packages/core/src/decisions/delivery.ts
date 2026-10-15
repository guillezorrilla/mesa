import { clip } from '../lib/clip.js';
import { shellWord } from '../lib/process.js';
import { daysBefore } from '../lib/time.js';
import { notePath, type ScopedContext } from './context.js';
import { type DecisionLine, type DecisionLog, isDecision, type NewDecision } from './log.js';
import type { SystemOneProvider } from './systemone.js';

// Automatic decision advice inside a session (ADR-0019 "Delivery into sessions", #463): the words a
// native turn event carries, how long Mesa waits for them, and the background ask that readies the
// saved goal's answer while the agent starts. A turn never waits past the per-turn deadline
// (PER_TURN_MS, 3,000 ms in all, ADR-0019), well under the native hooks' 5 s timeout, past which a
// hook is killed, its turn blocked for the whole timeout and its context dropped
// (docs/spikes/decision-assistance-feasibility.md): on a miss, an abstention, a late or missing
// model, it carries nothing and the agent works as without Mesa.

/** The most characters of advice one event carries. */
export const ADVICE_CHARS = 700;

/**
 * A turn's advice from its scoped context: the source the model was sure of, with its excerpt, in
 * Mesa's fixed words; nothing when it abstained, chose none, or gave no answer.
 */
export function turnAdvice(context: ScopedContext): string | undefined {
  const { evaluation, sources } = context;
  const top = sources[0];
  if (evaluation.status !== 'accepted' || evaluation.answer === 'none' || !top) return undefined;
  return clip(
    [
      `Mesa decision advice for this prompt (automatic; advice only, it never acts): ${context.advice}`,
      `${top.id} "${top.title}": ${top.excerpt}`,
    ].join('\n'),
    ADVICE_CHARS,
  );
}

/** How far back a session's sent advice is looked for. */
export const ADVICE_DAYS = 30;

/** The advice sent to `session` in the last ADVICE_DAYS, each naming its note, newest first. */
export const sentAdvice = (log: DecisionLog, now: Date, session: string) =>
  log
    .read({ since: daysBefore(now, ADVICE_DAYS), session })
    .filter(
      (e): e is DecisionLine & { note: string } =>
        isDecision(e) && e.site === 'relevance' && e.changed && e.note !== undefined,
    );

/** The note a turn's advice names, when it names one. */
export const advisedNote = (context: ScopedContext) => notePath(context.sources[0]?.id);

/**
 * The Decision log's line for one automatic relevance ask: the note advised, if advice was sent
 * (`sent`) or held back because the session already had it (`repeat`); skipped when no source
 * shared enough words for the model to be asked. The rules have no answer at this site, and the
 * prompt is never kept.
 */
export function adviceEntry(
  context: ScopedContext,
  project: string,
  provider: SystemOneProvider,
  sent: boolean,
  repeat = false,
): NewDecision {
  const { evaluation, sources } = context;
  const note = sent || repeat ? advisedNote(context) : undefined;
  return {
    site: 'relevance',
    session: context.session,
    project,
    question: 'Which vault note helps this prompt?',
    rules: null,
    answer:
      notePath(evaluation.answer) ??
      (typeof evaluation.answer === 'string' ? evaluation.answer : null),
    by: provider,
    status: sources.length === 0 ? 'skipped' : evaluation.status,
    changed: sent,
    ...(evaluation.margin === undefined ? {} : { margin: evaluation.margin }),
    ...(evaluation.latencyMs ? { latencyMs: evaluation.latencyMs } : {}),
    ...(note ? { note } : {}),
    ...(repeat ? { repeat } : {}),
  };
}

/**
 * What a session's window runs in the background before its agent, while the profile has a
 * Decision model and the session a saved goal: `mesa decisions prepare`, which asks for the goal's
 * answer while the agent starts, so its first turn reads a ready answer. Its own subshell, silent,
 * never waited on; it binds to the window's session as any mesa inside it does.
 */
export const prepareCommand = (self: readonly string[]) =>
  `(${self.map(shellWord).join(' ')} decisions prepare >/dev/null 2>&1 &); `;
