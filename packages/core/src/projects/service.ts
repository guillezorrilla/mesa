import type { MesaContext } from '../context.js';
import { callerOf } from '../sessions/caller.js';
import { cloneProject } from './clone.js';
import { discoverProjects } from './discover.js';
import { repositoryUrl } from './project-url.js';
import {
  listProjects,
  overrideProject,
  type ProjectUpdate,
  pendingScripts,
  registerProject,
  trustProject,
  unregisterProject,
  updateProject,
  visitProject,
} from './projects.js';
import { readRegistry } from './registry.js';
import { sortProjects } from './sort.js';

/** The profile's registered projects. */
export function projectsService(ctx: MesaContext) {
  const { record, open, absolute } = ctx;
  // Only a person approves a repository's worktree scripts: not mesa run inside a Mesa window.
  const outsideSession = () =>
    !callerOf({ store: ctx.store, env: ctx.deps.env, profileName: ctx.profile }).inMesaWindow;
  return {
    register: (dir: string, create = false, label?: string) =>
      record(
        {
          summary: (r) => `Registered project ${r.project.name}`,
          failure: `Could not register ${absolute(dir)}`,
          project: (r) => r.project.name,
          inputs: { dir: absolute(dir), create, ...(label !== undefined ? { label } : {}) },
          outputs: (r) => ({ path: r.path, wroteMesaYaml: r.created }),
        },
        () => registerProject(open(), { dir: absolute(dir), create, label }),
      ),
    list: (sort?: string) => {
      const profile = open();
      const rows = listProjects(profile);
      return sort
        ? sortProjects(
            rows,
            readRegistry(profile.paths.registry),
            sort === 'last-session' || sort === 'active-sessions' ? ctx.store.list() : [],
            sort,
          )
        : rows;
    },
    visit: (name: string) => visitProject(open(), name, ctx.deps.clock().toISOString()),
    discover: (root: string) => discoverProjects(open(), absolute(root)),
    clone: (input: string) => {
      const source = repositoryUrl(input);
      return record(
        {
          summary: (r) => `Cloned project ${r.project.name}`,
          failure: 'Could not clone project',
          project: (r) => r.project.name,
          argv: ctx.deps.argv.map((word) => (word === input ? '[repository URL]' : word)),
          inputs: { slug: source.slug },
          outputs: (r) => ({ path: r.path, wroteMesaYaml: r.created }),
        },
        () => cloneProject(open(), ctx.deps.run, source),
      );
    },
    update: (name: string, patch: ProjectUpdate) =>
      record(
        {
          summary: () => `Updated project ${name}`,
          failure: `Could not update project ${name}`,
          project: () => name,
          inputs: { name, ...patch },
          outputs: (r) => ({ label: r.label, pinned: r.pinned, hidden: r.hidden }),
        },
        () => updateProject(open(), name, patch),
      ),
    /** One of the project's mesa.yaml overrides set, or removed when `value` is undefined. */
    override: (name: string, path: string, value: string | undefined) =>
      record(
        {
          summary: () =>
            value === undefined ? `Unset ${path} in ${name}` : `Set ${path} in ${name}`,
          failure: `Could not change ${path} in ${name}`,
          project: () => name,
          inputs: { name, path, ...(value === undefined ? { unset: true } : {}) },
          outputs: (r) => ({ value: r.value }),
        },
        () => overrideProject(open(), name, path, value, outsideSession()),
      ),
    /** Approves the setup and teardown the project's mesa.yaml names now: a person's override. */
    pending: (name: string) => pendingScripts(open(), name),
    trust: (name: string, expected: readonly string[]) =>
      record(
        {
          kind: 'guardrail',
          summary: () => `Approved worktree scripts in ${name}`,
          failure: `Could not approve worktree scripts in ${name}`,
          project: () => name,
          inputs: { name, expected },
          outputs: (r) => ({
            override: 'trusted',
            ...(r.setup ? { setup: r.setup } : {}),
            ...(r.teardown ? { teardown: r.teardown } : {}),
          }),
        },
        () => trustProject(open(), name, outsideSession(), expected),
      ),
    unregister: (name: string) =>
      record(
        {
          summary: (r) => `Unregistered project ${r.name}`,
          failure: `Could not unregister ${name}`,
          project: (r) => r.name,
          inputs: { name },
          outputs: (r) => ({ path: r.path }),
        },
        () => unregisterProject(open(), name),
      ),
  };
}
