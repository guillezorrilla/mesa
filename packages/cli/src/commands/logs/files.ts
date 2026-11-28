import { defineCommand } from '../../command.js';

export const logsFiles = defineCommand({
  name: 'logs files',
  summary:
    'List the log files a project keeps anywhere on disk, and the gitignored *.log files in its checkout Mesa suggests',
  args: ['project?'],
  example: 'mesa logs files lantern-cove',
  run: async ({ mesa, args }) => {
    const found = await mesa.logs.files(args.project);
    const text = [
      ...found.files,
      ...found.suggested.map((path) => `${path}  (suggested: mesa logs add ${path})`),
    ].join('\n');
    return { data: found, text: text || 'no log files' };
  },
});

export const logsAdd = defineCommand({
  name: 'logs add',
  summary:
    "Keep a log file anywhere on disk as one of a project's log sources (in this profile only)",
  args: ['path'],
  flags: { project: { type: 'string', description: 'Its project (default: this one)' } },
  example: 'mesa logs add log/development.log',
  run: ({ mesa, args, flags }) => {
    const kept = mesa.logs.addFile(args.path, flags.project);
    return { data: kept, text: kept.files.join('\n') };
  },
});

export const logsRemove = defineCommand({
  name: 'logs remove',
  summary: "Stop keeping a log file as one of a project's log sources; the file stays",
  args: ['path'],
  flags: { project: { type: 'string', description: 'Its project (default: this one)' } },
  example: 'mesa logs remove log/development.log',
  run: ({ mesa, args, flags }) => {
    const kept = mesa.logs.removeFile(args.path, flags.project);
    return { data: kept, text: kept.files.join('\n') || 'no log files kept' };
  },
});
