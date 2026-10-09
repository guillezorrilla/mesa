import { defineCommand } from '../../command.js';

export const tickets = defineCommand({
  name: 'tickets',
  summary: "List the Jira tickets of a project's followed views, read live",
  args: ['project'],
  example: 'mesa tickets lantern-cove',
  run: async ({ mesa, args }) => {
    const data = await mesa.tickets.list(args.project);
    if (!data.views.length)
      return { data, text: `${data.project} follows no ticket views; see mesa tickets follow` };
    const views = data.views.map((view) => {
      const why = view.error ?? view.note;
      return `${view.name}: ${view.describe}${view.sprints ? ` [${view.sprints.join(', ')}]` : ''}${why ? ` - ${why}` : ''}`;
    });
    const rows = data.tickets.map((ticket) => {
      const running = ticket.sessions.map((s) => s.project).join(', ');
      return `${ticket.key}  ${ticket.status}  ${ticket.summary}${running ? `  (running in ${running})` : ''}`;
    });
    return { data, text: [...views, '', ...(rows.length ? rows : ['No tickets.'])].join('\n') };
  },
});
