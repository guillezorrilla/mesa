import { ANSWER_VIAS, type AnswerVia, MesaError } from '@mesa/core';
import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

const isVia = (value: string): value is AnswerVia =>
  (ANSWER_VIAS as readonly string[]).includes(value);

/** A person's answer to a session's pending prompt; an agent caller is refused (ADR-0003). */
export const answer = defineCommand({
  name: 'answer',
  summary:
    "Answer a waiting session's permission or question prompt as a person, with an option from mesa prompt or --text",
  args: ['session', 'option?'],
  flags: {
    text: { type: 'string', description: 'A typed answer, where the question takes one' },
    prompt: {
      type: 'string',
      description: 'The prompt id from mesa prompt; refused as stale when another one waits',
    },
    via: {
      type: 'string',
      description: `Where the person answered, for the receipt: ${ANSWER_VIAS.join(', ')}; default cli`,
    },
  },
  example: 'mesa answer a1b2c3d4 allow',
  run: async ({ mesa, args, flags }) => {
    const via = flags.via ?? 'cli';
    if (!isVia(via)) throw new MesaError('usage', `--via must be one of ${ANSWER_VIAS.join(', ')}`);
    const recorded = await mesa.sessions.answer(
      args.session,
      { option: args.option, text: flags.text, prompt: flags.prompt },
      via,
    );
    const { answered, session, prompt, kind, option, answer: given } = recorded.result;
    const data = { answered, session, prompt, kind, ...(option ? { option } : {}), answer: given };
    return recordedOutput(recorded, { data, text: `answered ${session}'s ${kind}: ${given}` });
  },
});
