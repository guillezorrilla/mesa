import type { Runner } from '../lib/process.js';

// A container's logs (CONTEXT.md, Logs panel): the one place that asks docker for them.

/** A container's name as docker allows it, so a typed id never reaches docker as a flag. */
export const CONTAINER_NAME = /^[A-Za-z0-9][\w.-]*$/;

/** The argv that runs `docker logs <args>` with its stderr on stdout, as the runner keeps only stdout. */
export const dockerLogsArgv = (args: readonly string[]) => [
  '-c',
  'exec docker logs "$@" 2>&1',
  'sh',
  ...args,
];

/** `docker logs <args>` (through sh, so a container's stderr comes too), within `timeoutMs`. */
export const dockerLogs = (run: Runner, args: readonly string[], timeoutMs: number) =>
  run('sh', dockerLogsArgv(args), timeoutMs);
