import { MesaError } from '@mesa/core';
import { defineCommand } from '../command.js';
import { bulkExit } from '../output/bulk.js';
import { recordedOutput } from '../output/recorded.js';

export const resume = defineCommand({
  name: 'resume',
  summary:
    "Reopen a session's conversation in a new window, as a new session; --all reopens every recoverable one, and exits 2 when any failed",
  args: ['session?'],
  flags: {
    all: { type: 'boolean', description: 'Every recoverable session instead of one' },
    interrupted: {
      type: 'boolean',
      description: 'With --all, only the sessions a restart ended since the machine booted',
    },
  },
  example: 'mesa resume a1b2c3d4',
  run: async ({ mesa, args, flags }) => {
    const { session } = args;
    if (flags.interrupted && !flags.all) throw new MesaError('usage', '--interrupted needs --all');
    if (flags.all && !session) {
      const data = await mesa.sessions.restore({ interrupted: flags.interrupted });
      const text = data.items
        .map((i) => `${i.id}: ${i.ok ? `resumed as ${i.result.id}` : i.error.message}`)
        .join('\n');
      return {
        data,
        text: text || 'nothing to restore',
        code: bulkExit(data.items.some((i) => !i.ok)),
      };
    }
    if (flags.all || !session) throw new MesaError('usage', 'name a session, or pass --all');
    const recorded = await mesa.sessions.resume(session);
    const { record } = recorded.result;
    return recordedOutput(recorded, { data: record, text: record.id });
  },
});
