import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';

const BUCKET = {
  need: 'needs review',
  updated: 'updated',
  waiting: 'waiting',
  other: 'not for you',
} as const;

export const prs = defineCommand({
  name: 'prs',
  summary:
    'List the open pull requests that need you across projects (GitHub through gh, Bitbucket through twg), most urgent first',
  flags: {
    project: { type: 'string', description: 'Only this project' },
    all: { type: 'boolean', description: 'Also list open PRs that are not for you' },
  },
  example: 'mesa prs --project lantern-cove',
  run: async ({ mesa, flags }) => {
    const data = await mesa.prs.list({
      ...(flags.project ? { project: flags.project } : {}),
      ...(flags.all ? { all: true } : {}),
    });
    const rows = columns(
      data.prs.map((p) => [
        p.project,
        `#${p.number}`,
        BUCKET[p.bucket],
        p.author,
        p.bucket === 'updated'
          ? `${p.since.commits} commits, ${p.since.replies} replies, ${p.since.resolved}/${p.since.threads} resolved`
          : '',
        p.title,
      ]),
    );
    return {
      data,
      text: [
        ...(rows.length ? rows : ['No pull requests need you.']),
        ...data.blocked.map(
          (b) => `${b.project}: ${b.cli} ${b.state}; run ${b.next ?? 'mesa prs setup'}`,
        ),
        ...data.problems.map((p) => `${p.project}: ${p.reason}`),
      ].join('\n'),
    };
  },
});

export const prsSetup = defineCommand({
  name: 'prs setup',
  summary:
    "Show each project's PR provider (GitHub or Bitbucket) and whether its CLI (gh, twg) is ready",
  example: 'mesa prs setup',
  run: async ({ mesa }) => {
    const data = await mesa.prs.setup();
    return {
      data,
      text: columns(
        data.map((r) => [r.project, r.provider ?? 'no PR provider', r.cli, r.state, r.next]),
      ).join('\n'),
    };
  },
});
