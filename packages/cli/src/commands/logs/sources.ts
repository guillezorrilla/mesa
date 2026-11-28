import { defineCommand } from '../../command.js';
import { columns } from '../../output/columns.js';

export const logsSources = defineCommand({
  name: 'logs sources',
  summary:
    "List where a project's local servers print: running containers, its sessions with an output log, its log files",
  args: ['project?'],
  example: 'mesa logs sources lantern-cove',
  run: async ({ mesa, args }) => {
    const found = await mesa.logs.sources(args.project);
    return {
      data: found,
      text: found.sources.length
        ? columns(found.sources.map((source) => [source.id, source.name, source.detail])).join('\n')
        : 'no running containers, server sessions or log files for this project',
    };
  },
});

export const logsModules = defineCommand({
  name: 'logs modules',
  summary:
    "List a project's modules (top-level folders with a Gradle, Maven or npm build file), the service names the IntelliJ steps offer",
  args: ['project?'],
  example: 'mesa logs modules lantern-cove',
  run: ({ mesa, args }) => {
    const found = mesa.logs.modules(args.project);
    return { data: found, text: found.modules.join('\n') || 'no modules' };
  },
});

export const logsFile = defineCommand({
  name: 'logs file',
  summary:
    "Make the folder for a service's log file and print its path, for an IDE to save its console to",
  args: ['name'],
  flags: {
    project: { type: 'string', description: 'Its project (default: this one)' },
    'path-only': { type: 'boolean', description: 'Print the path without making its folder' },
  },
  example: 'mesa logs file tide-api --project lantern-cove',
  run: ({ mesa, args, flags }) => {
    const found = mesa.logs.file(args.name, flags.project, !flags['path-only']);
    return { data: found, text: found.path };
  },
});
