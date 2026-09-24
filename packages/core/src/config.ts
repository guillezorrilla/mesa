import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { AgentSchema, DEFAULT_AGENT } from './agents.js';
import type { Env } from './process.js';
import { MesaError } from './result.js';
import { parseWith, readYaml, setYamlPath } from './yaml-file.js';

// Strict objects, so a typo in the file or in `mesa config set` is an error, not a silent no-op.
export const ConfigSchema = z.strictObject({
  vault: z.string().refine(isAbsolute, 'must be an absolute path'),
  defaultAgent: AgentSchema.default(DEFAULT_AGENT),
  skills: z.array(z.string()).default([]),
  decisions: z
    .strictObject({
      backend: z.enum(['rules', 'adapter', 'jev']).default('adapter'),
      threshold: z.number().min(0).max(1).default(0.7),
    })
    .prefault({}),
  sessions: z.strictObject({ log: z.boolean().default(true) }).prefault({}),
  /** Name to a literal value or an `env:VAR` reference. Never printed in the clear. */
  keys: z.record(z.string(), z.string()).default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

export const CONFIG_HEADER = 'Mesa profile config. Edit with `mesa config set <path> <value>`.';

/** A full config from partial input, with the schema defaults filled in. */
export const buildConfig = (input: unknown, file: string): Config =>
  parseWith(ConfigSchema, input, file);

function requireConfigFile(file: string): void {
  if (!existsSync(file)) {
    throw new MesaError('not_found', `${file} not found; run mesa init --vault <path>`);
  }
}

export function loadConfig(file: string): Config {
  requireConfigFile(file);
  return readYaml(file, ConfigSchema);
}

/** Every key value becomes `***`: the only form in which a config leaves Mesa. */
export function redactConfig(config: Config): Config {
  return { ...config, keys: Object.fromEntries(Object.keys(config.keys).map((k) => [k, '***'])) };
}

/**
 * Sets one dotted path; `value` is read as YAML (`0.5`, `true`, `[a, b]`). Returns the new value,
 * redacted under `keys`.
 */
export function setConfigValue(file: string, dotted: string, value: string): unknown {
  requireConfigFile(file);
  const next = redactConfig(setYamlPath(file, ConfigSchema, dotted, parse(value)));
  return dotted
    .split('.')
    .reduce<unknown>((node, k) => (node as Record<string, unknown>)?.[k], next);
}

/** A key's value, with an `env:VAR` reference read from `env`. */
export function resolveKey(config: Config, name: string, env: Env): string | undefined {
  const value = config.keys[name];
  return value?.startsWith('env:') ? env[value.slice(4)] : value;
}
