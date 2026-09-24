import { resolve } from 'node:path';
import { redactConfig, setConfigValue } from './config.js';
import { type ObsidianPaths, runDoctor } from './doctor.js';
import { profilePaths } from './paths.js';
import type { Runner } from './process.js';
import { initProfile, openProfile, type ProfileInfo } from './profile.js';
import { listProjects, registerProject, unregisterProject } from './projects.js';

/** Everything Mesa takes from the outside world. Only an entrypoint builds the real one. */
export type MesaDeps = {
  home: string;
  /** Resolves relative paths the user types. */
  cwd: string;
  run: Runner;
  obsidian: ObsidianPaths;
};

/**
 * The composition root: every Mesa service for one profile, wired to `deps`. The CLI builds one
 * per invocation; tests build one over a temp home.
 */
export function createMesa(profile: string, deps: MesaDeps) {
  const paths = profilePaths(deps.home, profile);
  const open = () => openProfile(paths);
  const absolute = (path: string) => resolve(deps.cwd, path);
  return {
    info: (): ProfileInfo => ({ profile, dir: paths.root }),
    init: (input: { vault: string; agent?: string }) =>
      initProfile(paths, { ...input, vault: absolute(input.vault) }),
    config: {
      /** Redacted: key values are `***`. */
      get: () => redactConfig(open().config),
      set: (dotted: string, value: string) => setConfigValue(paths.config, dotted, value),
    },
    projects: {
      register: (dir: string, create = false) =>
        registerProject(open(), { dir: absolute(dir), create }),
      list: () => listProjects(open()),
      unregister: (name: string) => unregisterProject(open(), name),
    },
    doctor: () => runDoctor({ run: deps.run, obsidian: deps.obsidian, profileDir: paths.root }),
  };
}

export type Mesa = ReturnType<typeof createMesa>;
