import { listPrice, MesaError, odds } from '@mesa/core';
import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';
import { recordedOutput } from '../output/recorded.js';

/** Asks Faro directly, to see what a backend answers; the answers go in a decision receipt. */
export const decide = defineCommand({
  name: 'decide',
  summary:
    'Ask Faro the questions on stdin: {"state": ..., "questions": [Choice, Score, Noul]}; writes a decision receipt',
  flags: {
    project: { type: 'string', description: 'Record the decision for this registered project' },
    session: { type: 'string', description: 'Record it for this Mesa session' },
    rationale: { type: 'string', description: 'Why this project or work decision matters' },
  },
  example: `echo '{"state":null,"questions":[{"kind":"Noul","id":"done","statement":"the tests pass"}]}' | mesa decide`,
  run: async ({ mesa, stdin, flags }) => {
    let input: { state?: unknown; questions?: unknown };
    try {
      input = JSON.parse(await stdin());
    } catch {
      throw new MesaError('usage', 'stdin is not JSON: pipe {"state": ..., "questions": [...]}');
    }
    const recorded = await mesa.decide(input?.state ?? null, input?.questions, flags);
    const decision = recorded.result;
    const lines = columns(
      decision.answers.map((a) => [
        a.id,
        a.kind,
        typeof a.answer === 'number' ? odds(a.answer) : String(a.answer),
        a.kind === 'Noul' ? `p ${odds(a.probabilities)}` : `confidence ${odds(a.confidence)}`,
      ]),
    );
    const cost = listPrice(decision.costUsd);
    const model = decision.model ? `, model ${decision.model}` : '';
    const text = [...lines, `backend ${decision.backend}${model}${cost}`].join('\n');
    return recordedOutput(recorded, { data: decision, text });
  },
});
