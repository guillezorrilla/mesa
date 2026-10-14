import { BUCKET_LABELS, counted } from '@mesa/core';
import { defineCommand } from '../../command.js';
import { columns } from '../../output/columns.js';

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
        BUCKET_LABELS[p.bucket],
        p.author,
        p.bucket === 'updated'
          ? `${counted(p.since.commits, 'commit')}, ${p.since.replies} ${p.since.replies === 1 ? 'reply' : 'replies'}, ${p.since.resolved}/${p.since.threads} resolved`
          : '',
        p.title,
      ]),
    );
    return {
      data,
      text: [
        ...(rows.length ? rows : ['No pull requests need you.']),
        ...data.blocked.map(
          (b) => `${b.project}: ${b.cli} ${b.state}${b.next ? `; run ${b.next}` : ''}`,
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
  flags: { project: { type: 'string', description: 'Only this project' } },
  example: 'mesa prs setup --project lantern-cove',
  run: async ({ mesa, flags }) => {
    const data = await mesa.prs.setup(flags.project);
    return {
      data,
      text: columns(
        data.map((r) => [r.project, r.provider ?? 'no PR provider', r.cli, r.state, r.next]),
      ).join('\n'),
    };
  },
});
