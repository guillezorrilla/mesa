import { existsSync } from 'node:fs';
import { z } from 'zod';
import { readYaml, writeYaml } from './yaml-file.js';

/** One registered project: its name and the directory holding its mesa.yaml. */
export type RegistryEntry = { name: string; path: string };

const RegistrySchema = z.strictObject({
  projects: z.array(z.strictObject({ name: z.string(), path: z.string() })),
});

const HEADER = 'Projects registered with this profile. Managed by mesa register.';

export const readRegistry = (file: string): RegistryEntry[] =>
  existsSync(file) ? readYaml(file, RegistrySchema).projects : [];

export function writeRegistry(file: string, projects: RegistryEntry[]): void {
  writeYaml(file, { projects }, { header: HEADER, mode: 0o600 });
}

/** The entry a new project would clash with: the same name or the same path. */
export const findClash = (entries: RegistryEntry[], candidate: RegistryEntry) =>
  entries.find((e) => e.name === candidate.name || e.path === candidate.path);
