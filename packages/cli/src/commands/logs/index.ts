import type { Command } from '../../command.js';
import { logsAdd, logsFiles, logsRemove } from './files.js';
import { logs } from './read.js';
import { logsRun } from './run.js';
import { logsFile, logsModules, logsSources } from './sources.js';

// Every `mesa logs` command, in help order.
export const LOGS_COMMANDS: Command[] = [
  logs,
  logsSources,
  logsModules,
  logsFile,
  logsRun,
  logsFiles,
  logsAdd,
  logsRemove,
];
