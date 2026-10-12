import { defineCommand } from '../../command.js';

export const ticketsTeams = defineCommand({
  name: 'tickets teams',
  summary: 'List the Linear teams a view can follow the cycle of',
  example: 'mesa tickets teams',
  run: async ({ mesa }) => {
    const data = await mesa.tickets.teams();
    const lines = data.map((t) => `${t.key}  ${t.name}`);
    return { data, text: lines.length ? lines.join('\n') : 'No Linear teams.' };
  },
});

/** A cycle in a line: its name and its first and last day. */
const cycleLine = (cycle: { name: string; startsAt: string; endsAt: string } | undefined) =>
  cycle ? `${cycle.name}, ${cycle.startsAt.slice(0, 10)} to ${cycle.endsAt.slice(0, 10)}` : 'none';

export const ticketsTeam = defineCommand({
  name: 'tickets team',
  summary:
    "List a Linear team's current and next cycles, its open projects, and the custom views a view can follow",
  args: ['team'],
  example: 'mesa tickets team ENG',
  run: async ({ mesa, args }) => {
    const data = await mesa.tickets.team(args.team);
    const text = [
      `Current cycle: ${cycleLine(data.cycles.current)}`,
      `Next cycle: ${cycleLine(data.cycles.next)}`,
      `Projects: ${data.projects.map((p) => `${p.name} (${p.id})`).join(', ') || 'none'}`,
      `Custom views: ${data.views.map((v) => `${v.name} (${v.id})`).join(', ') || 'none'}`,
    ].join('\n');
    return { data, text };
  },
});
