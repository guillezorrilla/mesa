import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MesaError } from '../lib/result.js';
import type { Runner } from '../lib/process.js';
import { sessionTitle } from '../sessions/record/labels.js';
import type { SessionStore } from '../sessions/record/store.js';
import { outputLog } from '../sessions/window/output-log.js';

// Where a project's local servers print (CONTEXT.md, Logs panel): running Docker containers, the
// Output logs of its unended sessions, and the log files in its folder under the profile's logs.

export type LogSourceKind = 'docker' | 'session' | 'file';

export type LogSource = {
  /** `docker:<container>`, `session:<id>` or `file:<name>`. */
  id: string;
  kind: LogSourceKind;
  name: string;
  detail: string;
};

export type LogSourceDeps = {
  run: Runner;
  store: SessionStore;
  /** Sessions' Output logs (ProfilePaths.logs). */
  sessionLogs: string;
  /** Each project's log files, `<serverLogs>/<project>/<name>.log` (ProfilePaths.serverLogs). */
  serverLogs: string;
};

/** A log file's name, as a `file:` source and the IntelliJ setup take it: no path in it. */
const FILE_NAME = /^[A-Za-z0-9][\w.-]{0,99}$/;

/** The name, checked, of log file `name`; usage when it could reach outside its folder. */
export function logFileName(name: string) {
  if (!FILE_NAME.test(name) || name.endsWith('.log'))
    throw new MesaError(
      'usage',
      `${name} is not a log file name: letters, digits, dots, dashes and underscores, without .log`,
    );
  return name;
}

/** Where `project`'s log file `name` is. */
export const logFile = (serverLogs: string, project: string, name: string) =>
  join(serverLogs, project, `${logFileName(name)}.log`);

/** The running containers, from `docker ps`; none when docker is missing or its daemon is down. */
async function containers(run: Runner): Promise<LogSource[]> {
  const ps = await run('docker', ['ps', '--format', '{{.Names}}\t{{.Image}}\t{{.Status}}'], 5_000);
  if (!ps.ok) return [];
  return ps.stdout
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const [name = '', image = '', status = ''] = line.split('\t');
      return { id: `docker:${name}`, kind: 'docker', name, detail: `${image}, ${status}` };
    });
}

/** `project`'s unended sessions with an Output log, plain terminals first. */
function sessions(deps: LogSourceDeps, project: string): LogSource[] {
  return deps.store
    .list()
    .filter((r) => r.project === project && !r.endedAt && existsSync(outputLog(deps.sessionLogs, r.id)))
    .sort((a, b) => Number(b.agent === 'terminal') - Number(a.agent === 'terminal'))
    .map((r) => ({
      id: `session:${r.id}`,
      kind: 'session',
      name: sessionTitle(r),
      detail: `${r.agent} session ${r.id}`,
    }));
}

/** The `*.log` files in `project`'s folder of the profile's logs, newest first. */
function files(deps: LogSourceDeps, project: string): LogSource[] {
  const dir = join(deps.serverLogs, project);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith('.log') && FILE_NAME.test(file.slice(0, -4)))
    .map((file) => ({ file, at: statSync(join(dir, file)).mtimeMs }))
    .sort((a, b) => b.at - a.at)
    .map(({ file }) => ({
      id: `file:${file.slice(0, -4)}`,
      kind: 'file',
      name: file.slice(0, -4),
      detail: 'log file',
    }));
}

/** Every source `project`'s local servers print to: containers, sessions, then log files. */
export async function logSources(deps: LogSourceDeps, project: string): Promise<LogSource[]> {
  return [...(await containers(deps.run)), ...sessions(deps, project), ...files(deps, project)];
}
