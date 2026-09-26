import { defineCommand } from '../command.js';

export const goal = defineCommand({
  name: 'goal',
  summary: 'Print the goal a session was started with (mesa open --goal)',
  args: ['session'],
  example: 'mesa goal a1b2c3d4',
  run: ({ mesa, args }) => {
    const data = mesa.sessions.goal(args.session);
    return { data, text: data.goal };
  },
});
