import { MesaError } from '@mesa/core';
import { defineCommand } from '../../command.js';
import { SEARCH_FLAG as search, VIEW_FLAGS } from '../../input/flags.js';

const { site } = VIEW_FLAGS;

export const ticketsFields = defineCommand({
  name: 'tickets fields',
  summary: 'List the Jira fields a ticket panel can show, marking the ones it shows (*)',
  flags: { search, site },
  example: 'mesa tickets fields --search component',
  run: async ({ mesa, flags }) => {
    const data = await mesa.tickets.fields(flags.search, flags.site);
    const shown = new Set(data.shown.map((f) => f.id));
    const lines = data.fields.map((f) => `${shown.has(f.id) ? '*' : ' '} ${f.id}  ${f.name}`);
    return { data, text: lines.length ? lines.join('\n') : 'No fields.' };
  },
});

export const ticketsFieldsSet = defineCommand({
  name: 'tickets fields set',
  summary: 'Set the Jira fields every ticket panel shows after its own, in order, for the profile',
  args: ['ids...'],
  flags: { clear: { type: 'boolean', description: 'Show only its own fields' }, site },
  example: 'mesa tickets fields set components customfield_10067',
  run: async ({ mesa, args, flags }) => {
    if (Boolean(args.ids.length) === Boolean(flags.clear))
      throw new MesaError('usage', 'name the fields by id, or pass --clear');
    const data = await mesa.tickets.setFields(args.ids, flags.site);
    return {
      data,
      text: data.length
        ? `Ticket panels show ${data.map((f) => f.name).join(', ')}`
        : 'Ticket panels show only their own fields',
    };
  },
});
