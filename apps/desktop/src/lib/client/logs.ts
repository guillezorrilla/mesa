import type { LogSource, ServerLogEntry } from '@mesa/core';
import { commandWith } from './spec';

/** The Logs panel's commands: a project's log sources, one source's entries, an IDE's log file. */
export const logsCommands = {
  'logs.sources': commandWith<{ project: string }, { sources: LogSource[] }>(({ project }) => [
    'logs',
    'sources',
    '--',
    project,
  ]),
  'logs.read': commandWith<
    { source: string; project: string; tail: number },
    { source: string; entries: ServerLogEntry[] }
  >(({ source, project, tail }) => [
    'logs',
    '--project',
    project,
    '--tail',
    String(tail),
    '--',
    source,
  ]),
  /** `make: false` names the path only; the folder is made once the person copies it. */
  'logs.file': commandWith<
    { name: string; project: string; make?: boolean },
    { path: string; source: string }
  >(({ name, project, make }) => [
    'logs',
    'file',
    '--project',
    project,
    ...(make === false ? ['--path-only'] : []),
    '--',
    name,
  ]),
};
