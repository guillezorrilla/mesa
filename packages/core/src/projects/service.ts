import type { MesaContext } from '../context.js';
import { cloneProject } from './clone.js';
import { discoverProjects } from './discover.js';
import { repositoryUrl } from './project-url.js';
import {
  listProjects,
  type ProjectUpdate,
  registerProject,
  unregisterProject,
  updateProject,
} from './projects.js';

/** The profile's registered projects. */
export function projectsService(ctx: MesaContext) {
  const { record, open, absolute } = ctx;
  return {
    register: (dir: string, create = false) =>
      record(
        {
          summary: (r) => `Registered project ${r.project.name}`,
          failure: `Could not register ${absolute(dir)}`,
          project: (r) => r.project.name,
          inputs: { dir: absolute(dir), create },
          outputs: (r) => ({ path: r.path, wroteMesaYaml: r.created }),
        },
        () => registerProject(open(), { dir: absolute(dir), create }),
      ),
    list: () => listProjects(open()),
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
