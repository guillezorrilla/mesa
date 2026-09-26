import type { SessionRecord } from './record.js';
import type { WindowTarget } from './tmux/format.js';

// A session's window name, `<agent>-<Mesa session id>` (CONTEXT.md, Window): written and read here.

/** The window a new session gets. */
export const windowName = (agent: string, id: string) => `${agent}-${id}`;

/** The Mesa session id in a window's name (`claude-a1b2c3d4`), if it has one. */
export const idOfWindow = (window: string) => /^[a-z]+-([0-9a-z]{8})$/.exec(window)?.[1];

/** The session's window on the profile's tmux server. */
export const windowOf = (r: SessionRecord): WindowTarget => ({
  project: r.tmux.session,
  window: r.tmux.window,
});
