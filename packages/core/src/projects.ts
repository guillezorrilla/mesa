import { existsSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseDocument, stringify } from 'yaml';
import { z } from 'zod';
import { loadConfig, parseWith, readYamlFile } from './config.js';
import { MesaError } from './result.js';

export const ProjectSchema = z.strictObject({
  name: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a slug: lowercase letters, digits, and hyphens'),
  agent: z.enum(['claude', 'codex']).optional(),
  priority: z.number().min(0).max(1).default(0.5),
  guardrail: z.enum(['normal', 'strict']).default('normal'),
  tmux: z.strictObject({ layout: z.string().optional() }).optional(),
  skills: z.array(z.string()).optional(),
});

export type Project = z.infer<typeof ProjectSchema>;

/** One registry entry: the project's name and the directory holding its mesa.yaml. */
type Entry = { name: string; path: string };

export type ProjectRow = {
  name: string;
  path: string;
  /** The project's preferred agent, else the profile's default. */
  agent: string | null;
  priority: number | null;
  skills: string[];
  /** False when the directory or its mesa.yaml is gone; the other fields are then unknown. */
  exists: boolean;
};

const RegistrySchema = z.strictObject({
  projects: z.array(z.strictObject({ name: z.string(), path: z.string() })),
});

const REGISTRY_HEADER = 'Projects registered with this profile. Managed by mesa register.';

const registryPath = (profileDir: string) => join(profileDir, 'registry.yaml');

export function readProject(dir: string): Project {
  const file = join(dir, 'mesa.yaml');
  if (!existsSync(file)) {
    throw new MesaError(
      'not_found',
      `no mesa.yaml in ${dir}; add one or run mesa register ${dir} --create`,
    );
  }
  return parseWith(ProjectSchema, readYamlFile(file), file);
}

function readRegistry(profileDir: string): Entry[] {
  loadConfig(profileDir); // the profile must exist: `mesa init` first
  const file = registryPath(profileDir);
  if (!existsSync(file)) return [];
  return parseWith(RegistrySchema, readYamlFile(file), file).projects;
}

function writeRegistry(profileDir: string, projects: Entry[]): void {
  const doc = parseDocument(stringify({ projects }));
  doc.commentBefore = ` ${REGISTRY_HEADER}`;
  writeFileSync(registryPath(profileDir), doc.toString(), { mode: 0o600 });
}

export const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Registers `<dir>/mesa.yaml`; with `create`, first writes a minimal one named after the folder. */
export function registerProject(opts: { profileDir: string; dir: string; create?: boolean }): {
  project: Project;
  path: string;
  created: boolean;
} {
  const projects = readRegistry(opts.profileDir);
  if (!existsSync(opts.dir)) throw new MesaError('not_found', `${opts.dir} does not exist`);
  const path = realpathSync(resolve(opts.dir));
  const file = join(path, 'mesa.yaml');
  const created = Boolean(opts.create) && !existsSync(file);
  const project = created
    ? parseWith(ProjectSchema, { name: slugify(basename(path)) }, file)
    : readProject(path);
  const clash = projects.find((p) => p.name === project.name || p.path === path);
  if (clash) {
    throw new MesaError(
      'invalid_config',
      `already registered: ${clash.name} at ${clash.path}; run mesa unregister ${clash.name} first`,
    );
  }
  if (created) writeFileSync(file, stringify(project), { flag: 'wx' });
  writeRegistry(opts.profileDir, [...projects, { name: project.name, path }]);
  return { project, path, created };
}

export function listProjects(profileDir: string): ProjectRow[] {
  const { defaultAgent } = loadConfig(profileDir);
  return readRegistry(profileDir).map(({ name, path }) => {
    if (!existsSync(join(path, 'mesa.yaml'))) {
      return { name, path, agent: null, priority: null, skills: [], exists: false };
    }
    const p = readProject(path);
    const agent = p.agent ?? defaultAgent;
    return { name, path, agent, priority: p.priority, skills: p.skills ?? [], exists: true };
  });
}

export function unregisterProject(profileDir: string, name: string): Entry {
  const projects = readRegistry(profileDir);
  const entry = projects.find((p) => p.name === name);
  if (!entry) throw new MesaError('not_found', `no project named ${name}; see mesa projects`);
  writeRegistry(
    profileDir,
    projects.filter((p) => p !== entry),
  );
  return entry;
}
