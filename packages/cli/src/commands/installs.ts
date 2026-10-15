import { MesaError } from '@mesa/core';
import { defineCommand } from '../command.js';

export const installs = defineCommand({
  name: 'installs',
  summary:
    'Print the anonymous install count: the ID sent once a day with the version and channel, and whether it is on; on or off turns it (off also erases it)',
  args: ['state?'],
  example: 'mesa installs off',
  run: async ({ mesa, args }) => {
    if (args.state === undefined) {
      const data = mesa.installs.status();
      const text = data.enabled
        ? `The anonymous install count is on${data.id ? ` (ID ${data.id})` : ''}. Turn it off with: mesa installs off`
        : 'The anonymous install count is off.';
      return { data, text };
    }
    if (args.state !== 'on' && args.state !== 'off')
      throw new MesaError('usage', 'state must be on or off');
    const data = await mesa.installs.set(args.state === 'on');
    const text = data.enabled
      ? 'The anonymous install count is on.'
      : data.erased
        ? 'The anonymous install count is off, and the broker erased this install.'
        : "The anonymous install count is off. The erase didn't reach the broker; run mesa installs off again when online.";
    return { data, text };
  },
});
