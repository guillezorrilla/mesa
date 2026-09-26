import { existsSync } from 'node:fs';
import { z } from 'zod';
import { lockedBy, withLockSync } from '../lib/lock-file.js';
import { readYaml, writeYaml } from '../lib/yaml-file.js';

/** One registered project: its name and the directory holding its mesa.yaml. */
export type RegistryEntry = { name: string; path: string };

const RegistrySchema = z.strictObject({
  projects: z.array(z.strictObject({ name: z.string(), path: z.string() })),
});

const HEADER = 'Projects registered with this profile. Managed by mesa register.';

export const readRegistry = (file: string): RegistryEntry[] =>
  existsSync(file) ? readYaml(file, RegistrySchema).projects : [];

/**
 * Rewrites the registry from what it holds now, under `registry.yaml.lock`, so two registers at
 * once keep both entries. `change` may throw to change nothing.
 */
export function updateRegistry(
  file: string,
  change: (entries: RegistryEntry[]) => RegistryEntry[],
): void {
  const lock = `${file}.lock`;
  const busy = () => lockedBy('the registry', lock, 'registry');
  withLockSync(
    lock,
    () =>
      writeYaml(file, { projects: change(readRegistry(file)) }, { header: HEADER, mode: 0o600 }),
    busy,
  );
}

/** The entry a new project would clash with: the same name or the same path. */
export const findClash = (entries: RegistryEntry[], candidate: RegistryEntry) =>
  entries.find((e) => e.name === candidate.name || e.path === candidate.path);
