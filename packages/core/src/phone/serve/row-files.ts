import { mkdirSync, watch } from 'node:fs';
import { basename, dirname } from 'node:path';
import { isSessionId } from '../../sessions/record/id.js';
import { RECORD_FILE } from '../../sessions/record/store.js';

/** What changed: a session's hook event log (its id), or another file a row is read from. */
export type RowFileChange = { hooked?: string };

/** The session whose hook event log (`<id>.jsonl`, eventsLog) `name` is, if it is one. */
const hookedSession = (name: string) => {
  const id = name.replace(/\.jsonl$/, '');
  return id !== name && isSessionId(id) ? id : undefined;
};

/**
 * Calls `changed` when a file a phone row is read from changes: a hook event log (`events`, named
 * in the change), a session record (`sessions`: its state, title, unread), or the phone's queue
 * (`queue`). Returns the stop. A folder that cannot be watched is left out: the listener's
 * fallback look still comes.
 */
export function watchRowFiles(
  paths: { events: string; sessions: string; queue: string },
  changed: (change: RowFileChange) => void,
): () => void {
  const queue = basename(paths.queue);
  const watched: [string, (name: string) => RowFileChange | undefined][] = [
    [
      paths.events,
      (name) => {
        const hooked = hookedSession(name);
        return hooked ? { hooked } : undefined;
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
