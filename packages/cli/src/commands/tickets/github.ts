import { defineCommand } from '../../command.js';

export const ticketsRepos = defineCommand({
  name: 'tickets repos',
  summary: 'List the GitHub repos a view can follow, and where to give Mesa access to more',
  flags: {
    project: { type: 'string', description: "Put this project's origin remote first" },
  },
  example: 'mesa tickets repos --project lantern-cove',
  run: async ({ mesa, flags }) => {
    const data = await mesa.tickets.repos(flags.project);
    const lines = data.repos.map(
      (r) => `${r.fullName}${r.origin ? "  (this project's remote)" : ''}`,
    );
    return {
      data,
      text: [
        ...(lines.length ? lines : ['Mesa can read no repos yet.']),
        `More: ${data.install}`,
      ].join('\n'),
    };
  },
});

export const ticketsRepo = defineCommand({
  name: 'tickets repo',
  summary: "List a GitHub repo's labels and open milestones, which a view narrows by",
  args: ['repo'],
  example: 'mesa tickets repo harbor-co/harbor-api',
  run: async ({ mesa, args }) => {
    const data = await mesa.tickets.repo(args.repo);
    const text = [
      `Labels: ${data.labels.map((l) => l.name).join(', ') || 'none'}`,
      `Milestones: ${data.milestones.map((m) => `${m.title} (${m.number})`).join(', ') || 'none'}`,
    ].join('\n');
    return { data, text };
  },
});
