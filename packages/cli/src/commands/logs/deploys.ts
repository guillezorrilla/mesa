import { defineCommand } from '../../command.js';
import { QUERY_FLAGS } from '../../input/cloud-flags.js';
import { columns } from '../../output/columns.js';

export const logsDeploys = defineCommand({
  name: 'logs deploys',
  summary:
    'List each deploy of the services shown over the range: Cloud Run revisions, App Engine versions and new GKE pod templates seen in the entries; a source that cannot be read is a note',
  flags: {
    env: QUERY_FLAGS.env,
    service: QUERY_FLAGS.service,
    project: QUERY_FLAGS.project,
    since: QUERY_FLAGS.since,
  },
  example: 'mesa logs deploys --since 1d --service tide-tables-123/tide-api',
  run: async ({ mesa, flags }) => {
    const found = await mesa.logs.deploys({
      env: flags.env,
      services: flags.service,
      projects: flags.project,
      since: flags.since,
    });
    return {
      data: found,
      text:
        [
          ...found.notes.map((n) => `note: ${n.message}`),
          ...columns(
            found.deploys.map((d) => [d.at, `${d.project}/${d.service}`, d.revision, d.source]),
          ),
        ].join('\n') || 'no deploys',
    };
  },
});
