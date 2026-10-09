import { codexConfig, codexHome } from '../agents/codex/paths.js';
import type { MesaContext } from '../context.js';
import { readWorkspaceFile, writeWorkspaceFile } from '../files/editor.js';
import { MesaError } from '../lib/result.js';
import { readProjectFile, setProjectSkills } from '../projects/project-file.js';
import { findProject } from '../projects/projects.js';
import { skillInventory } from './inventory.js';
import { GUIDELINES, isPipelineSkill, readLibrary } from './library.js';
import { listSkills, syncSkills } from './sync.js';

/** Mesa's skills: the library, what a profile and a project enable, and linking them in. */
export function skillsService(ctx: MesaContext) {
  const libraryDir = ctx.skillsDir;
  /**
   * A project's folder and the skills enabled for it: the profile's, agent-guidelines while
   * `sessions.guidelines` is on, its mesa.yaml extras, and for a Skill run of a pipeline skill
   * (PIPELINE_SKILLS), that skill.
   */
  const scope = (project?: string, run?: string) => {
    const profile = ctx.open();
    const entry = project === undefined ? undefined : findProject(profile, project);
    const extras = entry ? (readProjectFile(entry.path).skills ?? []) : [];
    const own = run && isPipelineSkill(run) ? [run] : [];
    const guidelines = profile.config.sessions.guidelines ? [GUIDELINES] : [];
    return {
      projectDir: entry?.path,
      enabled: new Set([...profile.config.skills, ...guidelines, ...extras, ...own]),
    };
  };
  const inventory = (project?: string) => {
    const library = readLibrary(libraryDir);
    const selected = scope(project);
    return skillInventory({
      home: ctx.home,
      env: ctx.env,
      library,
      listed: listSkills({ library, libraryDir, ...selected }),
      projectDir: selected.projectDir,
      codexConfig: codexConfig(codexHome(ctx.home, ctx.env)),
    });
  };
  const document = (id: string, project?: string, file = 'SKILL.md') => {
    const row = inventory(project).find((skill) => skill.id === id);
    if (!row) throw new MesaError('not_found', `skill ${id} is unavailable`);
    if (file !== 'SKILL.md' && !row.supportFiles.includes(file)) {
      throw new MesaError('usage', `${file} is not a listed support file of ${row.name}`);
    }
    return {
      row,
      checkout: { project: project ?? 'global', path: row.path, registered: false },
      file,
    };
  };
  return {
    /**
     * The library's skills, enabled or not, and with `project`, that project's own too; as a
     * Skill run of `run` sees them when given.
     */
    list: (project?: string, run?: string) =>
      listSkills({ library: readLibrary(libraryDir), libraryDir, ...scope(project, run) }),
    inventory,
    /** Add or remove a shipped skill from this project's mesa.yaml policy. */
    setProject: (project: string, name: string, enabled: boolean) =>
      ctx.record(
        {
          summary: () => `Updated ${name} policy in ${project}`,
          failure: `Could not update ${name} in ${project}`,
          project: () => project,
          inputs: { project, name, enabled },
          changed: (result) => result.changed,
        },
        () => {
          if (!readLibrary(libraryDir).some((skill) => skill.name === name)) {
            throw new MesaError('not_found', `no Mesa skill ${name}`);
          }
          const { config } = ctx.open();
          if (!enabled && config.skills.includes(name)) {
            throw new MesaError(
              'usage',
              `${name} is on in profile ${ctx.profile}'s skills, so one project cannot turn it off; change the profile with mesa config set skills`,
            );
          }
          if (!enabled && name === GUIDELINES && config.sessions.guidelines) {
            throw new MesaError(
              'usage',
              `${name} is on for every project in profile ${ctx.profile}; turn it off in Settings or with mesa config set sessions.guidelines false`,
            );
          }
          const { projectDir } = scope(project);
          const current = readProjectFile(projectDir as string).skills ?? [];
          if (current.includes(name) === enabled) {
            return { project, name, enabled, skills: current, changed: false };
          }
          const skills = enabled
            ? [...new Set([...current, name])]
            : current.filter((skill) => skill !== name);
          setProjectSkills(projectDir as string, skills, ctx);
          return { project, name, enabled, skills, changed: true };
        },
      ),
    read: (id: string, project?: string, file?: string) => {
      const selected = document(id, project, file);
      return readWorkspaceFile(selected.checkout, selected.file);
    },
    write: (id: string, text: string, revision: string, project?: string, file?: string) =>
      ctx.record(
        {
          summary: () => `Saved skill document ${file ?? 'SKILL.md'}`,
          failure: `Could not save skill document ${file ?? 'SKILL.md'}`,
          project: () => project,
          inputs: { id, file: file ?? 'SKILL.md' },
        },
        () => {
          const selected = document(id, project, file);
          if (!selected.row.writable) {
            throw new MesaError('usage', selected.row.readOnlyReason ?? 'Skill is read-only');
          }
          return writeWorkspaceFile(selected.checkout, selected.file, text, revision);
        },
      ),
    /**
     * The same sync into `folder` (where a session's agent runs: the project's, its worktree,
     * or an adopted session's own), without a receipt of its own: every start of a session runs
     * it (launch.ts). A Skill run of `run` gets its skill linked too when it is a pipeline skill.
     */
    linkInto: (project: string, folder: string, run?: string) =>
      syncSkills({
        library: readLibrary(libraryDir),
        libraryDir,
        enabled: scope(project, run).enabled,
        projectDir: folder,
      }),
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
