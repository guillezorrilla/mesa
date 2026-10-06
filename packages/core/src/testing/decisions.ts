import type { Decision, DecisionRecorder } from '../decisions/types.js';

/** A DecisionRecorder that keeps every decision in `decisions`, for tests. */
export function memoryRecorder(): DecisionRecorder & { decisions: Decision[] } {
  const decisions: Decision[] = [];
  return { decisions, record: (d) => void decisions.push(d) };
}
