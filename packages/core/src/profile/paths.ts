import { join } from 'node:path';

/**
 * Where a profile keeps its files, `<home>/.mesa/<profile>/`, and the name of its tmux socket. The
 * only module that knows the layout.
 */
export type ProfilePaths = {
  root: string;
  config: string;
  registry: string;
  sessions: string;
  /** The agent hooks' event logs, one `<session id>.jsonl` each. */
  events: string;
  /** The one-line scripts `mesa attach --app` hands to a terminal app. */
  attachScripts: string;
  /** Sessions' git worktrees, `<project>/<branch>` each (CONTEXT.md, Worktree). */
  worktrees: string;
  /** Handoff notes, `<successor id>.md` each (CONTEXT.md, Handoff). */
  handoffs: string;
  /** ADR-0001: every profile has its own tmux server, never the user's. */
  tmuxSocket: string;
};

/** Where every profile's folder lives. */
export const profilesDir = (home: string) => join(home, '.mesa');

export function profilePaths(home: string, profile: string): ProfilePaths {
  const root = join(profilesDir(home), profile);
  return {
    root,
    config: join(root, 'config.yaml'),
    registry: join(root, 'registry.yaml'),
    sessions: join(root, 'sessions'),
    events: join(root, 'sessions', 'events'),
    attachScripts: join(root, 'attach'),
    worktrees: join(root, 'worktrees'),
    handoffs: join(root, 'handoffs'),
    tmuxSocket: `mesa-${profile}`,
  };
}
