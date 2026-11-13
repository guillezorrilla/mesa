import { mkdirSync, watch } from 'node:fs';
import { basename, dirname } from 'node:path';
import { isSessionId } from '../../sessions/record/id.js';
import { RECORD_FILE } from '../../sessions/record/store.js';

/**
 * What changed: a session's hook event log (its id), a session's output log (its id: no row is
 * read from it, only a watched session's screen), or another file a row is read from.
 */
export type RowFileChange = { hooked?: string; logged?: string };

/** The session whose `<id><ext>` file `name` is, if it is one. */
const sessionOf = (name: string, ext: string) => {
  const id = name.endsWith(ext) ? name.slice(0, -ext.length) : '';
  return isSessionId(id) ? id : undefined;
};

/**
 * Calls `changed` when a file a phone row is read from changes: a hook event log (`events`, named
 * in the change), a session record (`sessions`: its state, title, unread), or the phone's queue
 * (`queue`); and when an output log (`logs`, named) does. Returns the stop. A folder that cannot
 * be watched is left out: the listener's fallback look still comes.
 */
export function watchRowFiles(
  paths: { events: string; sessions: string; queue: string; logs: string },
  changed: (change: RowFileChange) => void,
): () => void {
  const queue = basename(paths.queue);
  const watched: [string, (name: string) => RowFileChange | undefined][] = [
    [
      paths.events,
      (name) => {
        const hooked = sessionOf(name, '.jsonl');
        return hooked ? { hooked } : undefined;
      },
    ],
    [
      paths.logs,
      (name) => {
        const logged = sessionOf(name, '.log');
        return logged ? { logged } : undefined;
      },
    ],
    [paths.sessions, (name) => (RECORD_FILE.test(name) ? {} : undefined)],
    [dirname(paths.queue), (name) => (name === queue ? {} : undefined)],
  ];
  const watchers = watched.flatMap(([dir, read]) => {
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const watcher = watch(dir, (_, name) => {
        // A change with no name (an FSEvents rescan) may be any of them.
        const change = name ? read(name) : {};
        if (change) changed(change);
      });
      return [watcher.on('error', () => undefined)];
    } catch {
      return [];
    }
  });
  return () => {
    for (const watcher of watchers) watcher.close();
  };
}
