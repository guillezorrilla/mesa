import { existsSync, readdirSync } from 'node:fs';
import type { LockDeps } from '../../lib/lock-file.js';
import { MesaError } from '../../lib/result.js';
import { profilePaths, profilesDir } from '../../profile/paths.js';
import { sessionStore } from '../record/store.js';

/** Other profiles' stores are only read here, so nothing may take an id from them. */
const readOnly = () => {
  throw new MesaError('internal', "another profile's sessions are read, never written, here");
};

/**
 * The agent session ids this home's other profiles' records hold, so their sessions are not
 * foreign on this profile's board. A profile whose records do not read counts as none.
 * ponytail: by agent session id only; another profile's session after a /clear still lists
 * here as foreign. Ask each profile's tmux for its pane pids if that shows.
 */
export function otherProfilesSessions(home: string, profile: string, lock: LockDeps): Set<string> {
  const root = profilesDir(home);
  if (!existsSync(root)) return new Set();
  const others = readdirSync(root, { withFileTypes: true }).filter(
    (e) => e.isDirectory() && e.name !== profile,
  );
  return new Set(
    others.flatMap((e) => {
      try {
        return sessionStore({ dir: profilePaths(home, e.name).sessions, newId: readOnly, lock })
          .list()
          .flatMap((r) => (r.agentSessionId ? [r.agentSessionId] : []));
      } catch {
        return [];
      }
    }),
  );
}
