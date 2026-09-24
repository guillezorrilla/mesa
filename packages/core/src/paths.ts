import { join } from 'node:path';

/** Where a profile keeps its files: `<home>/.mesa/<profile>/`. The only module that knows the layout. */
export type ProfilePaths = { root: string; config: string; registry: string; sessions: string };

export function profilePaths(home: string, profile: string): ProfilePaths {
  const root = join(home, '.mesa', profile);
  return {
    root,
    config: join(root, 'config.yaml'),
    registry: join(root, 'registry.yaml'),
    sessions: join(root, 'sessions'),
  };
}
