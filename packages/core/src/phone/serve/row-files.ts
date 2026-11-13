import { mkdirSync, watch } from 'node:fs';
import { basename, dirname } from 'node:path';
import { RECORD_FILE } from '../../sessions/record/store.js';

/** A hook event log's file name, `<session id>.jsonl`. */
const EVENT_LOG = /^([0-9a-z]{8})\.jsonl$/;

/** What changed: a session's hook event log (its id), or another file a row is read from. */
export type RowFileChange = { hooked?: string };

/**
 * Calls `changed` when a file a phone row is read from changes: a hook event log (`events`, named
 * in the change), a session record (`sessions`: its state, title, unread), or the phone's queue
 * (`queue`). Returns the stop. A watch that fails stays quiet: the listener's fallback look still
 * comes.
 */
export function watchRowFiles(
  paths: { events: string; sessions: string; queue: string },
  changed: (change: RowFileChange) => void,
): () => void {
  const queue = basename(paths.queue);
  const heard = (name: string): RowFileChange | undefined => {
    const hooked = EVENT_LOG.exec(name)?.[1];
    return hooked ? { hooked } : undefined;
  };
  const watched: [string, (name: string) => RowFileChange | undefined][] = [
    [paths.events, heard],
    [paths.sessions, (name) => (RECORD_FILE.test(name) ? {} : undefined)],
    [dirname(paths.queue), (name) => (name === queue ? {} : undefined)],
  ];
  const watchers = watched.map(([dir, read]) => {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    return watch(dir, (_, name) => {
      // A change with no name (an FSEvents rescan) may be any of them.
      const change = name ? read(name) : {};
      if (change) changed(change);
    }).on('error', () => undefined);
  });
  return () => {
    for (const watcher of watchers) watcher.close();
  };
}
