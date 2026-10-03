import { AGENT_STATES } from '../sessions/states.js';
import type { Answer, Question } from './types.js';

// The four first-release decision sites (ADR-0019): what each asks a model, and when Mesa accepts
// the answer instead of abstaining.

export const DECISION_SITES = ['supervision', 'relevance', 'next-step', 'evidence'] as const;
export type DecisionSite = (typeof DECISION_SITES)[number];

/** What a session's screen says, by state: the supervision Choice's option descriptions. */
const STATE_CRITERIA: Record<(typeof AGENT_STATES)[number], string> = {
  working: 'The agent is in the middle of a turn: running tools, thinking or streaming output.',
  'waiting-permission':
    'The agent stopped to ask the human to approve a command, tool or file change.',
  'waiting-question': 'The agent asked the human a question and stopped for the answer.',
  idle: 'The turn is over and the prompt is waiting for a new instruction.',
  done: 'The agent program exited normally.',
  failed: 'The agent program crashed or exited with an error.',
};

type Wording = { instructions: string; criteria: Record<string, string> };

const WORDING: Record<DecisionSite, Wording> = {
  supervision: {
    instructions: 'Which state is this coding agent session in, judging only by its screen?',
    criteria: STATE_CRITERIA,
  },
  relevance: {
    instructions: 'Which candidate source is most relevant to the query?',
    criteria: { none: 'No candidate is relevant to the query.' },
  },
  'next-step': {
    instructions: 'Which candidate step should the session take next toward its goal?',
    criteria: {
      defer:
        'No candidate is clearly right: evidence is missing, every candidate repeats a failed attempt, or a human must decide.',
    },
  },
  evidence: {
    instructions: 'Does the evidence support the completion claim?',
    criteria: {
      true: 'The evidence directly shows the claimed work is complete and verified.',
      false: 'The evidence is missing, unrelated, stale, contradictory or only asserts success.',
    },
  },
};

/** `question` with its site's wording: instructions and the descriptions it has for its names. */
export function siteQuestion(site: DecisionSite, question: Question): Question {
  const { instructions, criteria } = WORDING[site];
  if (question.kind === 'Noul') return { ...question, criteria };
  const names = question.kind === 'Choice' ? question.options : question.levels;
  const known = Object.fromEntries(names.flatMap((n) => (criteria[n] ? [[n, criteria[n]]] : [])));
  return { ...question, instructions, criteria: known };
}

/**
 * How decisively an answer leans, 0 (even) to 1 (certain), the same way for every backend:
 * (n * max p - 1) / (n - 1) over its n names, which for a Noul is |2p - 1|. A backend's own
 * confidence field means different things across providers (ADR-0019), so policy reads this.
 */
export function margin(answer: Answer): number {
  const ps =
    answer.kind === 'Noul'
      ? [answer.probabilities, 1 - answer.probabilities]
      : Object.values(answer.probabilities);
  const n = ps.length;
  return n < 2 ? 1 : Math.max(0, Math.min(1, (n * Math.max(...ps) - 1) / (n - 1)));
}

/**
 * Each site's acceptance threshold on `margin`, fitted on the calibration split only (ADR-0019:
 * the lowest margin whose accepted calibration answers meet the site's gate accuracy, never below
 * 0.5, truncated to 3 places): below it, Mesa abstains.
 */
export const ACCEPT_AT: Record<DecisionSite, number> = {
  supervision: 0.663,
  relevance: 0.5,
  'next-step': 0.721,
  evidence: 0.766,
};

/** Whether `answer` at `site` is accepted (true) or Mesa abstains (false). */
export const accepted = (site: DecisionSite, answer: Answer) => margin(answer) >= ACCEPT_AT[site];
