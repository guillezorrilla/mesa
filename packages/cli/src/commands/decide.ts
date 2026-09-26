import { MesaError } from '@mesa/core';
import { defineCommand } from '../command.js';
import { columns } from '../format.js';

const two = (n: number) => n.toFixed(2);

/** Asks Faro directly, to see what a backend answers: nothing is recorded. */
export const decide = defineCommand({
  name: 'decide',
  summary: 'Ask Faro the questions on stdin: {"state": ..., "questions": [Choice, Score, Noul]}',
  example: `echo '{"state":null,"questions":[{"kind":"Noul","id":"done","statement":"the tests pass"}]}' | mesa decide`,
  run: async ({ mesa, stdin }) => {
    let input: { state?: unknown; questions?: unknown };
    try {
      input = JSON.parse(await stdin());
    } catch {
      throw new MesaError('usage', 'stdin is not JSON: pipe {"state": ..., "questions": [...]}');
    }
    const decision = await mesa.decide(input?.state ?? null, input?.questions);
    const lines = columns(
      decision.answers.map((a) => [
        a.id,
        a.kind,
        typeof a.answer === 'number' ? two(a.answer) : String(a.answer),
        a.kind === 'Noul' ? `p ${two(a.probabilities)}` : `confidence ${two(a.confidence)}`,
      ]),
    );
    const cost =
      decision.costUsd === undefined ? '' : ` (list price $${decision.costUsd.toFixed(4)})`;
    return { data: decision, text: [...lines, `backend ${decision.backend}${cost}`].join('\n') };
  },
});
