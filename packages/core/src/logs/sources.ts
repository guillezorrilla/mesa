import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import { sessionTitle } from '../sessions/record/labels.js';
import type { SessionStore } from '../sessions/record/store.js';
import { outputLog } from '../sessions/window/output-log.js';
import { changedAt, fileSource, stateAt } from './log-files.js';
import { type LogSource, sourceId } from './source-id.js';

// Where a project's local servers print (CONTEXT.md, Logs panel): Docker containers running or
// exited within the hour, the Output logs of its unended sessions, the log files in its folder
// under the profile's logs and the ones it keeps anywhere, each with when it printed its last line.

export type LogSourceDeps = {
  run: Runner;
  store: SessionStore;
  /** Sessions' Output logs (ProfilePaths.logs). */
  sessionLogs: string;
  /** Each project's log files, `<serverLogs>/<project>/<name>.log` (ProfilePaths.serverLogs). */
  serverLogs: string;
  now: () => Date;
  /** The log files anywhere on disk a person added to the project (log-files.ts). */
  logFiles: (project: string) => readonly string[];
};

/** Docker's word for a container that exited within the hour (`Exited (1) 5 minutes ago`). */
const EXITED_LATELY =
  /^Exited \(\d+\) (Less than a second|\d+ seconds?|About a minute|\d+ minutes?) ago$/;

/** A container's name as docker allows it, so a typed id never reaches docker as a flag. */
export const CONTAINER_NAME = /^[A-Za-z0-9][\w.-]*$/;

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

/**
 * When container `name` printed its last line, from `docker logs --tail 1 --timestamps` (stderr
 * too, through sh, as the runner keeps only stdout); null when it printed none or docker failed.
 */
async function lastDockerLine(run: Runner, name: string) {
  const read = await run(
    'sh',
    ['-c', 'exec docker logs "$@" 2>&1', 'sh', '--timestamps', '--tail', '1', name],
    5_000,
  );
  const stamp = read.ok ? read.stdout.trim().split(' ')[0] : undefined;
  return stamp && !Number.isNaN(Date.parse(stamp)) ? stamp : null;
}

/**
 * The containers running, and those that exited within the hour (stopped), from one `docker ps`,
 * each with its last line's time; none when docker is missing or its daemon is down.
 */
async function containers(run: Runner, now: Date): Promise<LogSource[]> {
  const ps = await run(
    'docker',
    [
      'ps',
      '--all',
      '--filter',
      'status=running',
      '--filter',
      'status=exited',
      '--format',
      '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.State}}',
    ],
    5_000,
  );
  if (!ps.ok) return [];
  const listed = ps.stdout
    .split('\n')
    .map((line) => line.split('\t'))
    .filter(
      ([name, , status = '', state]) =>
        Boolean(name) && (state === 'running' || EXITED_LATELY.test(status)),
    );
  return Promise.all(
    listed.map(async ([name = '', image = '', status = '', state]) => {
      const lastLine = await lastDockerLine(run, name);
      return {
        id: sourceId('docker', name),
        kind: 'docker' as const,
        name,
        detail: `${image}, ${status}`,
        state: state === 'running' ? stateAt(lastLine, now) : ('stopped' as const),
        lastLine,
      };
    }),
  );
}

/** `project`'s unended sessions with an Output log, plain terminals first. */
function sessions(deps: LogSourceDeps, project: string): LogSource[] {
  return deps.store
    .list()
    .filter(
      (r) => r.project === project && !r.endedAt && existsSync(outputLog(deps.sessionLogs, r.id)),
    )
    .sort((a, b) => Number(b.agent === 'terminal') - Number(a.agent === 'terminal'))
    .map((r) => {
      const lastLine = changedAt(outputLog(deps.sessionLogs, r.id));
      return {
        id: sourceId('session', r.id),
        kind: 'session',
        name: sessionTitle(r),
        detail: `${r.agent} session ${r.id}`,
        state: stateAt(lastLine, deps.now()),
        lastLine,
      };
    });
}

/** The `*.log` files in `project`'s folder of the profile's logs, newest first. */
function files(deps: LogSourceDeps, project: string): LogSource[] {
  const dir = join(deps.serverLogs, project);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith('.log'))
    .map((file) => ({ name: file.slice(0, -4), lastLine: changedAt(join(dir, file)) }))
    .filter(({ name }) => FILE_NAME.test(name))
    .sort((a, b) => (b.lastLine ?? '').localeCompare(a.lastLine ?? ''))
    .map(({ name, lastLine }) => ({
      id: sourceId('file', name),
      kind: 'file',
      name,
      detail: 'log file',
      state: stateAt(lastLine, deps.now()),
      lastLine,
    }));
}

/**
 * Every source `project`'s local servers print to: containers, sessions, the log files in its
 * folder of the profile's logs, then the ones it keeps anywhere on disk.
 */
export async function logSources(deps: LogSourceDeps, project: string): Promise<LogSource[]> {
  return [
    ...(await containers(deps.run, deps.now())),
    ...sessions(deps, project),
    ...files(deps, project),
    ...deps.logFiles(project).map((path) => fileSource(path, deps.now())),
  ];
}
