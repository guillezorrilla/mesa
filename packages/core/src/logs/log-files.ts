import { existsSync, statSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import type { LockDeps } from '../lib/lock-file.js';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import { type RegistryEntry, updateRegistry } from '../projects/registry.js';
import { LIVE_MS, type LogSource, type LogSourceState, sourceId } from './source-id.js';

// Log files a project's servers write (CONTEXT.md, Logs panel): where its own folder's files are
// (by name), the ones a person added anywhere, kept in the profile's registry, and the gitignored
// `*.log` files Mesa suggests.

/** A log file's name, as a `file:` source and the IntelliJ setup take it: no path in it. */
const FILE_NAME = /^[A-Za-z0-9][\w.-]{0,99}$/;

/** Whether `name` is a log file name in a project's folder (logFileName). */
export const isLogFileName = (name: string) => FILE_NAME.test(name);

/** The name, checked, of log file `name`; usage when it could reach outside its folder. */
export function logFileName(name: string) {
  if (!FILE_NAME.test(name) || name.endsWith('.log'))
    throw new MesaError(
      'usage',
      `${name} is not a log file name: letters, digits, dots, dashes and underscores, without .log`,
    );
  return name;
}

/** Where `project`'s log file `name` is, in its folder of the profile's logs. */
export const logFile = (serverLogs: string, project: string, name: string) =>
  join(serverLogs, project, `${logFileName(name)}.log`);

/** How many suggestions Mesa offers. */
const SUGGESTED = 20;

/** When `file` last changed, as an ISO time: when its writer printed its last line; null when it is gone. */
export function changedAt(file: string) {
  const stat = statSync(file, { throwIfNoEntry: false });
  return stat ? new Date(stat.mtimeMs).toISOString() : null;
}

/** Live with a line in the last minute, else quiet. */
export const stateAt = (lastLine: string | null, now: Date): LogSourceState =>
  lastLine && now.getTime() - Date.parse(lastLine) < LIVE_MS ? 'live' : 'quiet';

/** `path` as a source: its file's name, its path, and when it last changed (none when it is gone). */
export function fileSource(path: string, now: Date): LogSource {
  const lastLine = changedAt(path);
  return {
    id: sourceId('file', path),
    kind: 'file',
    name: basename(path),
    detail: lastLine ? path : `${path} (not there)`,
    state: stateAt(lastLine, now),
    lastLine,
  };
}

/**
 * The gitignored `*.log` files in `dir`'s checkout, by absolute path, outside `node_modules`:
 * what Mesa suggests adding. None when git cannot tell.
 */
export async function suggestedLogFiles(run: Runner, dir: string, known: readonly string[]) {
  const listed = await run(
    'git',
    // Git skips node_modules itself, so a large one does not run into the timeout.
    [
      '-C',
      dir,
      'ls-files',
      '--others',
      '--ignored',
      '--exclude-standard',
      '--',
      '*.log',
      ':(exclude,glob)**/node_modules/**',
    ],
    5_000,
  );
  if (!listed.ok) return [];
  return listed.stdout
    .split('\n')
    .filter(Boolean)
    .map((path) => join(dir, path))
    .filter((path) => !known.includes(path))
    .slice(0, SUGGESTED);
}

/** Whether a `file:` source names a file kept anywhere (an absolute path), not one in the project's folder. */
export const keptAnywhere = (name: string) => isAbsolute(name);

/** Adds or removes `path` from project `name`'s log files in the registry; the list it has after. */
export function changeLogFiles(
  lock: LockDeps,
  registry: string,
  name: string,
  path: string,
  add: boolean,
) {
  if (!isAbsolute(path)) throw new MesaError('usage', `${path} is not an absolute path`);
  if (add && (!existsSync(path) || !statSync(path).isFile()))
    throw new MesaError('not_found', `no file at ${path}`);
  let files: string[] = [];
  updateRegistry(lock, registry, (entries: RegistryEntry[]) =>
    entries.map((entry) => {
      if (entry.name !== name) return entry;
      const kept = (entry.logFiles ?? []).filter((each) => each !== path);
      files = add ? [...kept, path] : kept;
      const { logFiles: _old, ...rest } = entry;
      return files.length ? { ...rest, logFiles: files } : rest;
    }),
  );
  return files;
}
