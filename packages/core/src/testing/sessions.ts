import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { profilePaths } from '../profile/paths.js';
import type { SessionRow } from '../sessions/board/rows.js';
import type { NewSession } from '../sessions/record/record.js';
import { sessionStore } from '../sessions/record/store.js';
import { prepareOutputLog } from '../sessions/window/output-log.js';
import { sequentialIds } from './ids.js';
import { lockDeps } from './lock.js';

/** A session record before its id: claude working on lantern-cove unless `overrides` say otherwise. */
export function newSession(overrides: Partial<NewSession> = {}): NewSession {
  const project = overrides.project ?? 'lantern-cove';
  const startedAt = overrides.startedAt ?? '2026-09-24T12:00:00.000Z';
  return {
    kind: 'interactive',
    project,
    agent: 'claude',
    tmux: { socket: 'mesa-default', session: project, window: 'claude-aaaaaa' },
    startedAt,
    lastState: { state: 'working', confidence: 0.95, at: startedAt, source: 'mesa' },
    ...overrides,
  };
}

/**
 * A session record across two projects (mesa open --with): lantern-cove, with tide-pool as its
 * additional project, each in its worktree on `feature` under /w, unless `overrides` say otherwise.
 */
export function multiProjectSession(overrides: Partial<NewSession> = {}): NewSession {
  const at = (project: string) => ({ path: `/w/${project}/feature`, branch: 'feature' });
  return newSession({
    worktree: at('lantern-cove'),
    additional: [{ project: 'tide-pool', worktree: at('tide-pool') }],
    ...overrides,
  });
}

/** A profile's session store under a temp home, as mesa keeps it: for reading or planting records. */
export const testStore = (home: string, profile = 'default', newId = sequentialIds()) =>
  sessionStore({ dir: profilePaths(home, profile).sessions, newId, lock: lockDeps() });

/** A session's lock as a mesa killed while holding it leaves it; its path, for the test to remove. */
export function staleLock(home: string, id: string, holder = 'a killed mesa', profile = 'default') {
  const lock = join(profilePaths(home, profile).sessions, `${id}.json.lock`);
  writeFileSync(lock, holder);
  return lock;
}

/** Session `id`'s output log in the default profile, holding `text` as its pipe writes it; its path. */
export function plantOutputLog(home: string, id: string, text: string | Buffer) {
  const file = prepareOutputLog(profilePaths(home, 'default').logs, id);
  writeFileSync(file, text);
  return file;
}

/** A board row holding only the fields a test reads. */
export const sessionRow = (fields: object) => fields as SessionRow;
