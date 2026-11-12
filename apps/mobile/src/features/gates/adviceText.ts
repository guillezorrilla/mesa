import type { GateAdvice } from '@mesa/core/phone';

// How the phone says the Decision model's advice on a decision gate: advice only, the person picks.

/** A probability as a whole percent. */
export const percent = (p: number) => `${Math.round(p * 100)}%`;

/** The advice in one line: what it leans to and how sure, or why there is none. */
export function adviceHeadline(advice: GateAdvice) {
  if (advice.status === 'unavailable') return `No advice: ${advice.reason ?? 'none came'}`;
  const odds = advice.odds.find((each) => each.option === advice.pick);
  if (!advice.pick || !odds) return 'The Decision model leaves this to you';
  return advice.status === 'accepted'
    ? `The Decision model advises ${advice.pick} (${percent(odds.p)})`
    : `The Decision model leans to ${advice.pick} (${percent(odds.p)}), not sure enough to advise`;
}
