import { defineCommand } from '../command.js';

export const sleep = defineCommand({
  name: 'sleep',
  summary:
    'Put to sleep every finished, read session idle for sessions.sleepAfterMinutes (0 is off): its agent quits, its session stays, mesa wake reopens it',
  flags: {
    shown: { type: 'string', description: 'The session shown in a focused window, kept awake' },
  },
  example: 'mesa sleep --shown a1b2c3d4',
  run: async ({ mesa, flags }) => {
    const data = await mesa.sessions.sleepIdle(flags.shown ? { shown: flags.shown } : {});
    const said = data.slept.length
      ? `asleep: ${data.slept.join(', ')}`
      : 'no session to put to sleep';
    return { data, text: data.warning ? `${said}\nwarning: ${data.warning}` : said };
  },
});
