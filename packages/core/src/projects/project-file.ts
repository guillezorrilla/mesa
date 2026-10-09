import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { AgentSchema } from '../agents/agents.js';
import type { LockDeps } from '../lib/lock-file.js';
import { MesaError } from '../lib/result.js';
import { parseWith } from '../lib/schema.js';
import { slugify } from '../lib/slug.js';
import { readYaml, setYamlPath, writeYaml } from '../lib/yaml-file.js';
import { PROJECT_TERMINAL_THEMES } from '../profile/terminal-palettes.js';
import { WORKTREE_OVERRIDE_FIELDS } from './overrides.js';

export { slugify } from '../lib/slug.js';

/** A project's priority when its mesa.yaml gives none, or it cannot be read: the middle. */
export const DEFAULT_PRIORITY = 0.5;

/** The file that makes a folder a project. */
const PROJECT_FILE = 'mesa.yaml';

const ProjectSchema = z.strictObject({
  name: z
    .string()
    .max(252, 'must fit projects/<name>.md: at most 252 ASCII characters')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a slug: lowercase letters, digits, and hyphens'),
  agent: AgentSchema.optional(),
  priority: z.number().min(0).max(1).default(DEFAULT_PRIORITY),
  guardrail: z.enum(['normal', 'strict']).default('normal'),
  tmux: z.strictObject({ layout: z.string().optional() }).optional(),
  skills: z.array(z.string()).optional(),
  // Overrides of the profile's settings for this project; one left out is the profile's.
  worktrees: z.strictObject(WORKTREE_OVERRIDE_FIELDS).partial().optional(),
  // No `custom`: its colors are each user's own, in their profile.
  terminal: z.strictObject({ theme: z.enum(PROJECT_TERMINAL_THEMES).optional() }).optional(),
});

/** The fields that override a profile setting, the ones `mesa projects set` changes. */
export const PROJECT_OVERRIDES = [
  ...Object.keys(WORKTREE_OVERRIDE_FIELDS).map((key) => `worktrees.${key}`),
  'terminal.theme',
];

export type Project = z.infer<typeof ProjectSchema>;

export const projectFile = (dir: string) => join(dir, PROJECT_FILE);

export function readProjectFile(dir: string): Project {
  const file = projectFile(dir);
  if (!existsSync(file)) {
    throw new MesaError(
      'not_found',
      `no ${PROJECT_FILE} in ${dir}; add one or run mesa register ${dir} --create`,
    );
  }
  return readYaml(file, ProjectSchema);
}

/** The minimal project for a folder: named after it unless named, schema defaults filled in. */
export const minimalProject = (dir: string, name = slugify(basename(dir))): Project =>
  parseWith(ProjectSchema, { name }, projectFile(dir));

/** Writes a new project file; never replaces an existing one. */
export const writeProjectFile = (dir: string, project: Project): boolean =>
  writeYaml(projectFile(dir), project, { exclusive: true });

/** Change only the skill policy, preserving the rest of the project's YAML and comments. */
export const setProjectSkills = (dir: string, skills: string[], lock: LockDeps): Project =>
  setYamlPath(projectFile(dir), ProjectSchema, 'skills', skills, lock);

/** Sets one override, or removes it when `value` is undefined, keeping the rest of the YAML. */
export function setProjectOverride(
  dir: string,
  dotted: string,
  value: unknown,
  lock: LockDeps,
): Project {
  if (!PROJECT_OVERRIDES.includes(dotted)) {
    throw new MesaError(
      'usage',
      `${dotted} is not a project override: ${PROJECT_OVERRIDES.join(', ')}`,
    );
  }
  return setYamlPath(projectFile(dir), ProjectSchema, dotted, value, lock);
}
