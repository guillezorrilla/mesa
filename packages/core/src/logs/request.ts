import { MesaError } from '../lib/result.js';
import type { ServerLogEntry } from './parse.js';
import { type ReadDeps, readEntries } from './read.js';
import { namesRequest } from './tokens.js';

// A whole request across a project's log sources (CONTEXT.md, Logs panel): every entry naming its
// request or trace id (tokens.ts) in each source, merged in time order, each labelled with its source.

/** How many entries of each source a request is looked for in. */
const LOOK = 2000;

/** An entry of a request, and the source (its id) it was read from. */
export type RequestEntry = ServerLogEntry & { source: string };

export type RequestLines = {
  id: string;
  /** The sources read. */
  sources: string[];
  /** The entries naming the request, oldest first. */
  entries: RequestEntry[];
  /** The sources with older lines than the 2000 entries searched, which may name it too. */
  truncated: string[];
  /** The sources that could not be read, and why: a container gone, a file removed. */
  failed: { source: string; message: string }[];
};

/** When `entry` was logged, in ms; NaN when its time does not read (Spring writes `,` before ms). */
const loggedAt = (entry: ServerLogEntry) =>
  entry.time ? Date.parse(entry.time.replace(',', '.')) : Number.NaN;

/**
 * Every entry of `sources` (ids) that names request `id` (namesRequest), from each one's last 2000,
 * merged by time: an entry with no time that reads keeps its place after the one before it in its
 * source (before its first, with that first), and entries of one time keep the order of `sources`. A `file:` source is `project`'s; a
 * source Mesa cannot read is listed in `failed`, not an error, and one with older lines than those
 * searched in `truncated`.
 */
export async function requestLines(
  deps: ReadDeps,
  project: string,
  id: string,
  sources: readonly string[],
): Promise<RequestLines> {
  const failed: RequestLines['failed'] = [];
  const truncated: string[] = [];
  const reads = await Promise.all(
    sources.map(async (source) => {
      try {
        const read = await readEntries(deps, source, { tail: LOOK, project: () => project });
        if (read.truncated) truncated.push(source);
        return read.entries.filter((entry) => namesRequest(entry.message, id));
      } catch (error) {
        if (!(error instanceof MesaError)) throw error;
        failed.push({ source, message: error.message });
        return [];
      }
    }),
  );
  const timed = reads.flatMap((entries, at) => {
    // Lines before a source's first time that reads go with it.
    let last =
      entries.map(loggedAt).find((time) => !Number.isNaN(time)) ?? Number.NEGATIVE_INFINITY;
    return entries.map((entry) => {
      const time = loggedAt(entry);
      if (!Number.isNaN(time)) last = time;
      return { entry: { ...entry, source: sources[at] as string }, time: last };
    });
  });
  // Array sort is stable, so ties keep each source's order and the order of `sources`.
  timed.sort((a, b) => a.time - b.time);
  return { id, sources: [...sources], entries: timed.map(({ entry }) => entry), truncated, failed };
}
