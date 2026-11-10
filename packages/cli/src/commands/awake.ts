import { awakeStatus, isKeepAwakeMode, KEEP_AWAKE_MODES, MesaError } from '@mesa/core';
import { defineCommand } from '../command.js';

export const awake = defineCommand({
  name: 'awake',
  summary:
    'Print when the app keeps the Mac awake (sessions.keepAwake), whether it wants to now, and how many sessions are working; off, on or working sets it',
  args: ['mode?'],
  example: 'mesa awake working',
  run: async ({ mesa, args }) => {
    if (args.mode !== undefined) {
      if (!isKeepAwakeMode(args.mode))
        throw new MesaError('usage', `mode must be ${KEEP_AWAKE_MODES.join(', ')}`);
      mesa.config.set('sessions.keepAwake', args.mode);
    }
    const data = awakeStatus(mesa.config.get().sessions.keepAwake, await mesa.sessions.list());
    const text = `keep awake: ${data.mode}; ${data.wanted ? 'keeping the Mac awake' : 'not keeping the Mac awake'} (${data.working} working)`;
    return { data, text };
  },
});
