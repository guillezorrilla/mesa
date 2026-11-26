import { defineCommand } from '../../command.js';

export const logsViewsImportMetrics = defineCommand({
  name: 'logs views import-metrics',
  summary: 'Turn each log-based metric of a GCP project into a saved view with its filter',
  flags: { project: { type: 'string', required: true, description: 'The GCP project' } },
  example: 'mesa logs views import-metrics --project tide-tables-123',
  run: async ({ mesa, flags }) => {
    const found = await mesa.logs.views.importMetrics(flags.project);
    return {
      data: found,
      text: found.views.map((v) => v.name).join('\n') || 'no log-based metrics',
    };
  },
});

export const logsViewsExport = defineCommand({
  name: 'logs views export',
  summary: "Write the profile's saved Cloud Logs views to a YAML file, to share them",
  args: ['file'],
  example: 'mesa logs views export views.yaml',
  run: ({ mesa, args }) => {
    const done = mesa.logs.views.export(args.file);
    return { data: done, text: `wrote ${done.views} views to ${done.file}` };
  },
});

export const logsViewsImport = defineCommand({
  name: 'logs views import',
  summary: 'Add the views a YAML file holds to the saved views; one of a kept name replaces it',
  args: ['file'],
  example: 'mesa logs views import views.yaml',
  run: async ({ mesa, args }) => {
    const found = await mesa.logs.views.import(args.file);
    return { data: found, text: found.views.map((v) => v.name).join('\n') };
  },
});
