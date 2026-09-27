import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';
import { z } from 'zod';
import { AgentSchema, CLAUDE_PERMISSION_MODES } from '../agents/agents.js';
import { DEFAULT_AGENT } from '../agents/names.js';
import { DecisionsBackendSchema } from '../decisions/types.js';
import type { Env } from '../lib/process.js';
import { REDACTED } from '../lib/redact.js';
import { MesaError } from '../lib/result.js';
import { parseWith } from '../lib/schema.js';
import { readYaml, setYamlPath } from '../lib/yaml-file.js';
import {
  BOARD_DENSITIES,
  BOARD_GROUPS,
  BOARD_SORTS,
  BOARD_VIEWS,
  DEFAULT_BOARD_PREFERENCES,
} from '../sessions/presentation.js';
import { DEFAULT_SHORTCUTS, validShortcut } from './shortcuts.js';

/** The terminal apps `mesa attach --app` can open. */
export const TERMINAL_APPS = ['Terminal', 'iTerm', 'Ghostty', 'WezTerm'] as const;
export type TerminalApp = (typeof TERMINAL_APPS)[number];

// Strict objects, so a typo in the file or in `mesa config set` is an error, not a silent no-op.
const ConfigSchema = z.strictObject({
  vault: z.string().refine(isAbsolute, 'must be an absolute path'),
  defaultAgent: AgentSchema.default(DEFAULT_AGENT),
  // The mesa skill teaches every agent Mesa starts to drive Mesa (skills/mesa).
  skills: z.array(z.string()).default(['mesa', 'mesa-handoff']),
  decisions: z
    .strictObject({
      backend: DecisionsBackendSchema.default('adapter'),
      adapter: AgentSchema.default('claude'),
      threshold: z.number().min(0).max(1).default(0.7),
    })
    .prefault({}),
  sessions: z.strictObject({ log: z.boolean().default(true) }).prefault({}),
  terminal: z.strictObject({ app: z.enum(TERMINAL_APPS).default('Terminal') }).prefault({}),
  shortcuts: z
    .strictObject({
      search: z
        .string()
        .refine(validShortcut, 'must be Mod plus a letter or digit')
        .default(DEFAULT_SHORTCUTS.search),
      board: z
        .string()
        .refine(validShortcut, 'must be Mod plus a letter or digit')
        .default(DEFAULT_SHORTCUTS.board),
      newSession: z
        .string()
        .refine(validShortcut, 'must be Mod plus a letter or digit')
        .default(DEFAULT_SHORTCUTS.newSession),
    })
    .refine((keys) => new Set(Object.values(keys)).size === 3, 'shortcuts must be unique')
    .prefault({}),
  board: z
    .strictObject({
      view: z.enum(BOARD_VIEWS).default(DEFAULT_BOARD_PREFERENCES.view),
      group: z.enum(BOARD_GROUPS).default(DEFAULT_BOARD_PREFERENCES.group),
      density: z.enum(BOARD_DENSITIES).default(DEFAULT_BOARD_PREFERENCES.density),
      sort: z.enum(BOARD_SORTS).default(DEFAULT_BOARD_PREFERENCES.sort),
      order: z
        .array(z.string().regex(/^[0-9a-z]{8}$/))
        .refine((ids) => new Set(ids).size === ids.length, 'ids must be unique')
        .default([]),
    })
    .prefault({}),
  /** How a headless run may act (mesa run): claude's --permission-mode and --allowedTools. */
  run: z
    .strictObject({
      permissionMode: z.enum(CLAUDE_PERMISSION_MODES).default('acceptEdits'),
      allowedTools: z.array(z.string().min(1)).default([]),
    })
    .prefault({}),
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
  return {
    ...config,
    keys: Object.fromEntries(Object.keys(config.keys).map((k) => [k, REDACTED])),
  };
}

const valueAt = (config: Config, dotted: string) =>
  dotted.split('.').reduce<unknown>((node, k) => (node as Record<string, unknown>)?.[k], config);

/** The value at `dotted` now; none in a file that does not validate, which a set may repair. */
function currentValue(file: string, dotted: string): unknown {
  try {
    return valueAt(loadConfig(file), dotted);
  } catch (error) {
    if (error instanceof MesaError && error.code === 'invalid_config') return undefined;
    throw error;
  }
}

/**
 * Sets one dotted path; `value` is read as YAML (`0.5`, `true`, `[a, b]`). Returns the new value,
 * redacted under `keys`, and whether it differs from the one before (defaults included).
 */
export function setConfigValue(
  file: string,
  dotted: string,
  value: string,
): { value: unknown; changed: boolean } {
  const before = currentValue(file, dotted);
  const next = setYamlPath(file, ConfigSchema, dotted, parse(value));
  return {
    value: valueAt(redactConfig(next), dotted),
    changed: !isDeepStrictEqual(before, valueAt(next, dotted)),
  };
}

/** A key's value, with an `env:VAR` reference read from `env`. */
export function resolveKey(config: Config, name: string, env: Env): string | undefined {
  const value = config.keys[name];
  return value?.startsWith('env:') ? env[value.slice(4)] : value;
}
