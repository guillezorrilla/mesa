import { MesaError } from '@mesa/core';
import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const stop = defineCommand({
  name: 'stop',
  summary:
    'End a session: its agent is asked to quit (up to 5 s), then its window is closed; a queued one is cancelled',
  args: ['session'],
  flags: {
    force: { type: 'boolean', description: 'Close the window at once, without asking the agent' },
    descendants: {
      type: 'boolean',
      description: 'Also stop every parent-linked descendant, child first',
    },
    expect: {
      type: 'string',
      description: 'Require these confirmed descendant IDs, comma separated',
    },
  },
  example: 'mesa stop a1b2c3d4',
  run: async ({ mesa, args, flags }) => {
    if (flags.expect && !flags.descendants)
      throw new MesaError('usage', '--expect requires --descendants');
    if (flags.descendants && !flags.expect)
      throw new MesaError('usage', '--descendants requires --expect with the confirmed IDs');
    if (flags.descendants) {
      const data = await mesa.sessions.stopDescendants(
        args.session,
        flags.force,
        flags.expect?.split(','),
      );
      return {
        data,
        text: data.items
          .map((item) => `${item.id}: ${item.ok ? item.result.outcome : item.error.message}`)
          .join('\n'),
        code: data.items.some((item) => !item.ok) ? 2 : 0,
      };
    }
    const recorded = await mesa.sessions.stop(args.session, flags.force ?? false);
    const { record, outcome } = recorded.result;
    const said = {
      exited: `stopped ${record.id}`,
      killed: `stopped ${record.id} (window closed)`,
      gone: `stopped ${record.id} (its window was already gone)`,
      cancelled: `cancelled ${record.id}: it was queued, and never starts now`,
      'already-ended': `session ${record.id} had already ended`,
    }[outcome];
    return recordedOutput(recorded, { data: { ...record, outcome }, text: said });
  },
});
