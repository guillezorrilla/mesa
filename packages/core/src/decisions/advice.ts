import type { Evaluation } from './evaluate.js';
import type { DecisionSite } from './sites.js';

// The words of decision advice (ADR-0019): fixed Mesa templates around an evaluation. A model
// answers only with an option it was offered or a probability, so advice never holds text, code,
// a rationale or tool arguments a model made up. Advice never acts, approves or marks work done.

const ABSTAINED: Record<DecisionSite, string> = {
  supervision: 'Mesa is not sure of the state, so the rules stand',
  relevance: 'Mesa is not sure which source is relevant, so they stay in their original order',
  'next-step': 'Mesa is not sure of a next step, so it gives no advice',
  evidence: 'Mesa is not sure whether the evidence supports the claim, so it gives no advice',
};

/** What an accepted answer means at its site. */
function acceptedText(e: Evaluation, how: string): string {
  switch (e.site) {
    case 'relevance':
      return e.answer === 'none'
        ? `No vault source is relevant to the query${how}.`
        : `Most relevant: ${e.answer}${how}. Read it before relying on it.`;
    case 'next-step':
      return e.answer === 'defer'
        ? `Mesa defers${how}: no candidate is clearly right; get more evidence or ask a person.`
        : `Suggested next step: ${e.answer}${how}. Advice only: weigh it and act yourself.`;
    case 'evidence':
      return e.answer
        ? `The evidence supports the claim${how}. Advice only: it does not mark the work complete.`
        : `The evidence does not support the claim${how}. Verify the work before calling it done.`;
    case 'supervision':
      return `The screen reads as ${e.answer}${how}.`;
  }
}

/** The advice an evaluation gives, in one or two sentences. */
export function adviceText(e: Evaluation): string {
  if (e.status === 'unavailable') return `No advice: ${e.reason ?? 'no answer'}.`;
  const how = ` (margin ${(e.margin ?? 0).toFixed(2)}${e.model ? `, ${e.model}` : ''})`;
  const text = e.status === 'abstained' ? `${ABSTAINED[e.site]}${how}.` : acceptedText(e, how);
  return e.experimental
    ? `${text} Experimental: ${e.site} advice has not passed both of Mesa's gates for this model.`
    : text;
}
