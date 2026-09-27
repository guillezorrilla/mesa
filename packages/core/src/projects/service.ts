import type { MesaContext } from '../context.js';
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
