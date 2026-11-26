import { defineCommand } from '../../command.js';
import { pairsOf, QUERY_FLAGS, queryOf } from '../../input/cloud-flags.js';
import { columns } from '../../output/columns.js';

export const logsGcp = defineCommand({
  name: 'logs gcp',
  summary:
    "Read the profile's Google Cloud Logging entries with your own gcloud from every project in logs.gcp, merged newest first; or list an env's services",
  flags: {
    ...QUERY_FLAGS,
    before: {
      type: 'string',
      description: 'Only entries before this ISO time: the next page back',
    },
    services: {
      type: 'boolean',
      description: 'List the services the env logged in the last hour instead, with their kind',
    },
  },
  example: 'mesa logs gcp --env beta --severity error --since 1h',
  run: async ({ mesa, flags }) => {
    if (flags.services) {
      const found = await mesa.logs.gcpServices(flags.env);
      return {
        data: found,
        text:
          columns(found.services.map((s) => [`${s.project}/${s.name}`, s.kind ?? ''])).join('\n') ||
          'no services logged in the last hour',
      };
    }
    const read = await mesa.logs.gcp({ ...queryOf(flags), before: flags.before });
    return {
      data: read,
      text:
        [
          ...read.warnings.map((w) => `warning: ${w.message}`),
          ...read.entries.map((e) =>
            [e.time, e.severity, `${e.project}/${e.service ?? '-'}`, e.message.split('\n')[0]].join(
              ' ',
            ),
          ),
        ].join('\n') || 'no entries match',
    };
  },
});

export const logsSetup = defineCommand({
  name: 'logs setup',
  summary:
    "Point Cloud Logs at one or more GCP projects, with optional envs as name=filter (each a Cloud Logging filter, applied in every project); writes the profile's logs.gcp",
  flags: {
    project: { type: 'string', multiple: true, description: 'A GCP project id (repeat for more)' },
    env: {
      type: 'string',
      multiple: true,
      description:
        'An env as name=filter, applied in every project, such as prod=resource.labels.cluster_name="prod"',
    },
  },
  example:
    'mesa logs setup --project tide-tables-123 --env beta=resource.labels.cluster_name="beta"',
  run: async ({ mesa, flags }) => {
    const done = await mesa.logs.gcpSetup(flags.project ?? [], pairsOf(flags.env, '--env'));
    return { data: done, text: `Cloud Logs reads ${done.gcp.projects.join(', ')}` };
  },
});

export const logsProjects = defineCommand({
  name: 'logs projects',
  summary:
    "Show gcloud's default GCP project and every project the account sees, or with --search those whose id or name holds the words, for logs setup",
  flags: { search: { type: 'string', description: 'Words of a project id or name' } },
  example: 'mesa logs projects --search tide',
  run: async ({ mesa, flags }) => {
    const found = await mesa.logs.gcpProjects(flags.search);
    return {
      data: found,
      text: [
        `default: ${found.current ?? 'none'}`,
        ...columns(found.projects.map((p) => [p.id, p.name])),
      ].join('\n'),
    };
  },
});

export const logsStar = defineCommand({
  name: 'logs star',
  summary: "Star a GCP project in the Logs tab's project switcher, or take its star off with --off",
  args: ['project'],
  flags: { off: { type: 'boolean', description: 'Take the star off' } },
  example: 'mesa logs star tide-tables-123',
  run: async ({ mesa, args, flags }) => {
    const done = await mesa.logs.star(args.project, !flags.off);
    return { data: done, text: done.starred.join('\n') || 'no starred projects' };
  },
});

export const logsEnvs = defineCommand({
  name: 'logs envs',
  summary:
    'Suggest envs for logs setup from GCP projects: one per GKE cluster, named from it, and Cloud Run services ending in an env suffix',
  flags: {
    project: { type: 'string', multiple: true, description: 'A GCP project id (repeat for more)' },
  },
  example: 'mesa logs envs --project tide-tables-123',
  run: async ({ mesa, flags }) => {
    const found = await mesa.logs.gcpEnvs(flags.project ?? []);
    return {
      data: found,
      text:
        columns(found.suggestions.map((s) => [s.name, s.filter, s.from])).join('\n') ||
        'no GKE clusters or suffixed Cloud Run services found',
    };
  },
});
