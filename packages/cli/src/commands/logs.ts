import { entryText, LOG_LEVELS, type LogLevel, MesaError, NO_OUTPUT_LOG } from '@mesa/core';
import { defineCommand } from '../command.js';
import { wholeNumber } from '../input/flags.js';
import { columns } from '../output/columns.js';

/** `--level`, checked to be one of the levels. */
function levelFlag(value: string | undefined): LogLevel | undefined {
  if (value === undefined) return undefined;
  if (!(LOG_LEVELS as readonly string[]).includes(value))
    throw new MesaError('usage', `--level must be one of ${LOG_LEVELS.join(', ')}, not ${value}`);
  return value as LogLevel;
}

export const logs = defineCommand({
  name: 'logs',
  summary:
    "Print a session's output log as plain text, or a log source's entries (docker:<name>, session:<id>, file:<name>)",
  args: ['source'],
  flags: {
    tail: { type: 'string', description: 'Print only the last N lines (entries for a source)' },
    level: {
      type: 'string',
      description: "A source's entries at this level or worse: error, warn, info, debug",
    },
    since: {
      type: 'string',
      description: "A source's entries since an ISO time or an age (10m, 2h)",
    },
    project: {
      type: 'string',
      description: 'The project a file: source is in (default: this one)',
    },
  },
  example: 'mesa logs docker:api --level error --tail 50',
  run: async ({ mesa, args, flags }) => {
    const tail = flags.tail === undefined ? undefined : wholeNumber(flags.tail, '--tail');
    // A session id has no colon; anything with one is a log source (docker:, session:, file:).
    if (args.source.includes(':')) {
      const read = await mesa.logs.read(args.source, {
        tail,
        level: levelFlag(flags.level),
        since: flags.since,
        project: flags.project,
      });
      return {
        data: read,
        text:
          read.entries.map((entry) => entryText(entry)).join('\n') ||
          `no entries in ${read.source}`,
      };
    }
    const log = mesa.sessions.logs(args.source, tail);
    const text = log.path
      ? log.lines.join('\n')
      : `session ${log.session} has no output log: ${NO_OUTPUT_LOG}`;
    return { data: log, text };
  },
});

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

export const logsRun = defineCommand({
  name: 'logs run',
  summary:
    "Run a command as it is (colours, input, Ctrl-C, exit status) and keep its output as one of this project's log sources",
  args: ['name', 'command...'],
  flags: {
    project: { type: 'string', description: 'Its project (default: the one this folder is in)' },
  },
  example: 'mesa logs run tide-api -- ./gradlew bootRun',
  run: ({ mesa, args, flags }) => {
    const ran = mesa.logs.run(args.name, args.command, flags.project);
    return {
      data: ran,
      text: `mesa: keeping this output for the Logs panel in ${ran.path}`,
      exec: ran.exec,
    };
  },
});

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
