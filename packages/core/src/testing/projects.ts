import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IdSource } from '../lib/ids.js';
import type { Runner } from '../lib/process.js';
import type { createMesa } from '../mesa.js';
import { agentWorld } from './agents.js';
import { gitRepo, withRealGit } from './git.js';
import { projectProfile } from './profile.js';

/**
 * Another registered project beside projectProfile's lantern-cove, `name` under `home`/src, a git
 * repository on main with its mesa.yaml (`mesaYaml`, else a minimal one): an additional project's
 * (mesa open --with). Its folder.
 */
export function gitProject(
  mesa: ReturnType<typeof createMesa>,
  home: string,
  name: string,
  mesaYaml = `name: ${name}\n`,
) {
  const dir = join(home, 'src', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mesa.yaml'), mesaYaml);
  gitRepo(dir);
  mesa.projects.register(dir);
  return dir;
}

/**
 * lantern-cove and tide-pool, both git repositories on main through the real git, over agentWorld:
 * for a session across two projects (mesa open --with). `run` wraps that runner when given.
 */
export function twoProjects({
  run,
  newId,
}: {
  run?: (git: Runner) => Runner;
  newId?: IdSource;
} = {}) {
  const world = agentWorld();
  const git = withRealGit(world.run);
  const { home, dir, mesa } = projectProfile(run ? run(git) : git, newId ? { newId } : {});
  gitRepo(dir);
  const tide = gitProject(mesa, home, 'tide-pool');
  return { world, home, dir, tide, mesa };
}
