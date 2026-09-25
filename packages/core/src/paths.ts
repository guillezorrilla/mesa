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
  /** The one-line scripts `mesa attach --app` hands to a terminal app. */
  attachScripts: string;
  /** ADR-0001: every profile has its own tmux server, never the user's. */
  tmuxSocket: string;
};

export function profilePaths(home: string, profile: string): ProfilePaths {
  const root = join(home, '.mesa', profile);
  return {
    root,
    config: join(root, 'config.yaml'),
    registry: join(root, 'registry.yaml'),
    sessions: join(root, 'sessions'),
    attachScripts: join(root, 'attach'),
    tmuxSocket: `mesa-${profile}`,
  };
}
