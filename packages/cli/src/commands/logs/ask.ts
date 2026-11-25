import { defineCommand } from '../../command.js';
import { QUERY_FLAGS, queryOf } from '../../input/cloud-flags.js';

export const logsAsk = defineCommand({
  name: 'logs ask',
  summary:
    'Answer a question about the Cloud Logs entries with an agent in General that may run read-only queries and cites entries by id; --conversation follows up; an env named prod asks once per GCP project first',
  args: ['question'],
  flags: {
    ...QUERY_FLAGS,
    conversation: { type: 'string', description: 'The conversation to follow up (mesa logs asks)' },
    'allow-prod': {
      type: 'boolean',
      description: 'Confirm, once for these GCP projects, that Ask sends prod entries to the model',
    },
  },
  example: 'mesa logs ask "what errors happen most?" --env beta --severity error',
  run: async ({ mesa, args, flags }) => {
    const asked = await mesa.logs.ask(args.question, {
      ...queryOf(flags),
      conversation: flags.conversation,
      allowProd: flags['allow-prod'],
    });
    return { data: asked, text: asked.answer };
  },
});

export const logsAsks = defineCommand({
  name: 'logs asks',
  summary: 'List the kept Ask conversations, newest first, with their questions',
  example: 'mesa logs asks',
  run: ({ mesa }) => {
    const found = mesa.logs.asks();
    return {
      data: found,
      text:
        found.asks.map((a) => `${a.id} ${a.turns.map((t) => t.question).join(' / ')}`).join('\n') ||
        'no Asks yet',
    };
  },
});
