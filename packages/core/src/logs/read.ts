import { existsSync } from 'node:fs';
import { tailLines } from '../lib/file-tail.js';
import type { LockDeps } from '../lib/lock-file.js';
import { MesaError } from '../lib/result.js';
import { outputTail } from '../sessions/window/output-log.js';
import { CONTAINER_NAME, dockerLogs } from './docker.js';
import { keptAnywhere, logFile } from './log-files.js';
import { atLeast, type LogLevel, parseLog, type RawLine, type ServerLogEntry } from './parse.js';
import { sinceTime } from './since.js';
import { parseSourceId } from './source-id.js';
import type { LogSourceDeps } from './sources.js';
import { terminalLine } from './terminal-line.js';

export type ReadOptions = {
  /** The last this many entries; 200 when not given. */
  tail?: number;
  /** Entries timed at or after it: an ISO time, or an age such as `30s`, `10m`, `2h`, `1d`. */
  since?: string;
  /** Entries at this level or more severe. */
  level?: LogLevel;
};

export type ReadDeps = LogSourceDeps & { lock: LockDeps; now: () => Date };

const DEFAULT_TAIL = 200;
/** How many raw lines a filtered read looks at, at least: the filters pick from these. */
const LOOK = 2000;
/** Bytes per line a file tail reads first, so most reads take one pass. */
const LINE_BYTES = 200;
/** A docker line, `<RFC 3339 time> <text>`, split into the time docker stamped and the text. */
function stamped(line: string): RawLine {
  const space = line.indexOf(' ');
  return /^\d{4}-\d\d-\d\dT/.test(line) && space > 0
    ? { time: line.slice(0, space), text: line.slice(space + 1) }
    : { text: line };
}

/** A container's last `lines` lines, stdout and stderr in the order docker kept them. */
async function dockerLines(deps: ReadDeps, name: string, lines: number, since?: string) {
  const args = [
    '--timestamps',
    '--tail',
    String(lines),
    ...(since ? ['--since', since] : []),
    name,
  ];
  const read = await dockerLogs(deps.run, args, 10_000);
  if (!read.ok)
    throw new MesaError('not_found', `could not read docker logs of ${name}: ${read.detail}`);
  // Without its last newline, so a full read counts exactly the lines asked for.
  return read.stdout.replace(/\n$/, '').split('\n').map(stamped);
}

/** The raw lines of `source`, at least the last `lines`; not_found for one Mesa cannot read. */
async function rawLines(
  deps: ReadDeps,
  source: string,
  project: (() => string) | undefined,
  lines: number,
  since?: string,
): Promise<RawLine[]> {
  const parsed = parseSourceId(source);
  if (parsed?.kind === 'docker' && CONTAINER_NAME.test(parsed.name))
    return dockerLines(deps, parsed.name, lines, since);
  if (parsed?.kind === 'session') {
    deps.store.get(parsed.name);
    const text = outputTail(deps.lock, deps.sessionLogs, parsed.name, lines);
    if (!text) throw new MesaError('not_found', `session ${parsed.name} has no output log`);
    return text.map((line) => ({ text: line }));
  }
  if (parsed?.kind === 'file') {
    if (!project) throw new MesaError('usage', `name the project whose log file ${parsed.name} is`);
    const named = project();
    // A path is one of the files the project keeps (log-files.ts); a name, one in its folder.
    const anywhere = keptAnywhere(parsed.name);
    if (anywhere && !deps.logFiles(named).includes(parsed.name))
      throw new MesaError('usage', `${parsed.name} is not one of project ${named}'s log files`);
    const file = anywhere ? parsed.name : logFile(deps.serverLogs, named, parsed.name);
    if (!existsSync(file))
      throw new MesaError('not_found', `no log file ${parsed.name} in project ${named}`);
    // Read anew each time, so a file IntelliJ rewrote on a new run starts over.
    for (let bytes = Math.max(64 * 1024, lines * LINE_BYTES); ; bytes *= 2) {
      const read = tailLines(file, bytes);
      if (!read.truncated || read.lines.length >= lines)
        // A terminal's file (mesa logs run) holds its escape sequences: read as plain text.
        return read.lines.slice(-lines).map((line) => ({ text: terminalLine(line).trimEnd() }));
    }
  }
  throw new MesaError(
    'usage',
    `${source} is not a log source: docker:<name>, session:<id> or file:<name>`,
  );
}

/**
 * readLog, and whether the source may hold older entries than the ones looked at: its read came
 * back with every line asked for, or the tail cut entries off.
 */
export async function readEntries(
  deps: ReadDeps,
  source: string,
  opts: ReadOptions & { project?: () => string } = {},
): Promise<{ source: string; entries: ServerLogEntry[]; truncated: boolean }> {
  const tail = opts.tail ?? DEFAULT_TAIL;
  const since = opts.since === undefined ? undefined : sinceTime(opts.since, deps.now());
  // Unfiltered, twice the entries asked for leaves room for their folded stacks.
  const look = opts.level || since ? Math.max(tail, LOOK) : tail * 2;
  const raw = await rawLines(deps, source, opts.project, look, since);
  const entries = parseLog(raw).filter(
    (entry) =>
      atLeast(entry, opts.level) &&
      (!since || (entry.time !== null && Date.parse(entry.time) >= Date.parse(since))),
  );
  const kept = tail ? entries.slice(-tail) : [];
  return { source, entries: kept, truncated: raw.length >= look || kept.length < entries.length };
}

/**
 * `source`'s last entries (parseLog), at `level` or more severe and timed at or after `since`
 * when given: the last `tail` of those found in its last 2000 lines (or `tail`, if more), or in
 * its last 2 x `tail` lines unfiltered. A `file:` source is the project `project` resolves. An entry with no time is left out when `since` is given.
 */
export async function readLog(
  deps: ReadDeps,
  source: string,
  opts: ReadOptions & { project?: () => string } = {},
): Promise<{ source: string; entries: ServerLogEntry[] }> {
  const { truncated: _, ...read } = await readEntries(deps, source, opts);
  return read;
}
