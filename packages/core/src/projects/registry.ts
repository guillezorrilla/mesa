import { existsSync } from 'node:fs';
import { z } from 'zod';
import type { LockDeps } from '../lib/lock-file.js';
import { parseWith } from '../lib/schema.js';
import { changeYaml, readYaml } from '../lib/yaml-file.js';

/** Profile-local presentation metadata never changes the project's stable mesa.yaml slug. */
export type RegistryEntry = {
  name: string;
  path: string;
  label?: string;
  pinned?: boolean;
  hidden?: boolean;
  visitedAt?: string;
  visits?: number;
  /** sha256 of the exact setup and teardown argv from its mesa.yaml this profile approved. */
  approved?: { setup?: string; teardown?: string };
};

const RegistrySchema = z.strictObject({
  projects: z.array(
    z.strictObject({
      name: z.string(),
      path: z.string(),
      label: z.string().optional(),
      pinned: z.boolean().optional(),
      hidden: z.boolean().optional(),
      visitedAt: z.iso.datetime().optional(),
      visits: z.number().int().nonnegative().optional(),
      approved: z
        .strictObject({
          setup: z
            .string()
            .regex(/^[0-9a-f]{64}$/)
            .optional(),
          teardown: z
            .string()
            .regex(/^[0-9a-f]{64}$/)
            .optional(),
        })
        .optional(),
    }),
  ),
});

const HEADER = 'Projects registered with this profile. Managed by mesa register.';
export const parseRegistryEntries = (input: unknown, file: string): RegistryEntry[] =>
  parseWith(RegistrySchema.shape.projects, input, file);

export const readRegistry = (file: string): RegistryEntry[] =>
  existsSync(file) ? readYaml(file, RegistrySchema).projects : [];

/**
 * Rewrites the registry from what it holds now, under `registry.yaml.lock`, so two registers at
 * once keep both entries. `change` may throw to change nothing.
 */
export function updateRegistry(
  lock: LockDeps,
  file: string,
  change: (entries: RegistryEntry[]) => RegistryEntry[],
): void {
  changeYaml(
    file,
    RegistrySchema,
    (current) => ({ projects: change(current?.projects ?? []) }),
    lock,
    HEADER,
  );
}

/** The entry a new project would clash with: the same name or the same path. */
export const findClash = (entries: RegistryEntry[], candidate: RegistryEntry) =>
  entries.find((e) => e.name === candidate.name || e.path === candidate.path);
