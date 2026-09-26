import type { MesaContext } from '../context.js';
import { readProjectFile } from '../projects/project-file.js';
import { findProject } from '../projects/projects.js';
import { readLibrary } from './library.js';
import { listSkills, syncSkills } from './sync.js';

/** Mesa's skills: the library, what a profile and a project enable, and linking them in. */
export function skillsService(ctx: MesaContext) {
  const libraryDir = ctx.deps.skillsDir;
  /** A project's folder and the skills enabled for it: the profile's, then its mesa.yaml extras. */
  const scope = (project?: string) => {
    const profile = ctx.open();
    const entry = project === undefined ? undefined : findProject(profile, project);
    const extras = entry ? (readProjectFile(entry.path).skills ?? []) : [];
    return { projectDir: entry?.path, enabled: new Set([...profile.config.skills, ...extras]) };
  };
  return {
    /** The library's skills, enabled or not, and with `project`, that project's own too. */
    list: (project?: string) =>
      listSkills({ library: readLibrary(libraryDir), libraryDir, ...scope(project) }),
    /** Links the enabled skills into the project's skill folders; unlinks Mesa's others. */
    sync: (project: string) =>
      ctx.record(
        {
          summary: (r) =>
            `Synced skills into ${project}: ${r.added.length} added, ${r.removed.length} removed`,
          failure: `Could not sync skills into ${project}`,
          project: () => project,
          inputs: { project },
          outputs: (r) => r,
          changed: (r) => r.added.length + r.removed.length > 0,
        },
        () => {
          const { projectDir, enabled } = scope(project);
          return syncSkills({
            library: readLibrary(libraryDir),
            libraryDir,
            enabled,
            projectDir: projectDir as string,
          });
        },
      ),
  };
}
