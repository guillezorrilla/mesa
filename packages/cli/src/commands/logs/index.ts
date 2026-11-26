import type { Command } from '../../command.js';
import { logsAsk, logsAsks, logsQuery } from './ask.js';
import { logsEnvs, logsGcp, logsProjects, logsSetup, logsStar } from './cloud.js';
import { logsCounts, logsErrorSamples, logsErrors, logsVolume } from './errors.js';
import { logsAdd, logsFiles, logsRemove } from './files.js';
import { logs } from './read.js';
import { logsRun } from './run.js';
import { logsSession } from './session.js';
import { logsEnable, logsLogin } from './signin.js';
import { logsFile, logsModules, logsSources } from './sources.js';
import { logsViewsExport, logsViewsImport, logsViewsImportMetrics } from './views.js';

// Every `mesa logs` command, in help order: local log sources, then Cloud Logs (CONTEXT.md).
export const LOGS_COMMANDS: Command[] = [
  logs,
  logsSources,
  logsModules,
  logsFile,
  logsRun,
  logsFiles,
  logsAdd,
  logsRemove,
  logsGcp,
  logsSetup,
  logsProjects,
  logsEnvs,
  logsStar,
  logsLogin,
  logsEnable,
  logsErrors,
  logsErrorSamples,
  logsCounts,
  logsVolume,
  logsViewsImportMetrics,
  logsViewsExport,
  logsViewsImport,
  logsAsk,
  logsQuery,
  logsAsks,
  logsSession,
];
