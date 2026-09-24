import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { isMap, parse, parseDocument, stringify } from 'yaml';
import { z } from 'zod';
import { MesaError } from './result.js';

// Strict objects, so a typo in the file or in `mesa config set` is an error, not a silent no-op.
export const ConfigSchema = z.strictObject({
  vault: z.string().refine(isAbsolute, 'must be an absolute path'),
  defaultAgent: z.enum(['claude', 'codex']).default('claude'),
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

const HEADER = 'Mesa profile config. Edit with `mesa config set <path> <value>`.';

export const configPath = (dir: string) => join(dir, 'config.yaml');

/** Parses `raw` with a schema; failure is invalid_config naming the file and the failing field. */
export function parseWith<T>(schema: z.ZodType<T>, raw: unknown, file: string): T {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  const first = issues[0];
  throw new MesaError('invalid_config', `${file}: ${first?.path || '(root)'}: ${first?.message}`, {
    issues,
  });
}

/** Reads a YAML file. Errors give the position only: the parser quotes source lines, which may hold a key. */
export function readYamlFile(file: string): unknown {
  try {
    return parse(readFileSync(file, 'utf8'));
  } catch (error) {
    const pos = (error as { linePos?: { line: number; col: number }[] }).linePos?.[0];
    const at = pos ? ` at line ${pos.line}, column ${pos.col}` : '';
    throw new MesaError('invalid_config', `${file}: not valid YAML${at}`);
  }
}

const validate = (raw: unknown, file: string): Config => parseWith(ConfigSchema, raw, file);

/** Creates the profile dir, `config.yaml` (mode 0600), and `sessions/`. A second run changes nothing. */
export function initProfile(opts: { dir: string; vault: string; agent?: string }): {
  created: boolean;
  path: string;
} {
  const path = configPath(opts.dir);
  if (existsSync(path)) return { created: false, path };
  const config = validate({ vault: opts.vault, defaultAgent: opts.agent }, path);
  mkdirSync(join(opts.dir, 'sessions'), { recursive: true, mode: 0o700 });
  const doc = parseDocument(stringify(config));
  doc.commentBefore = ` ${HEADER}`;
  try {
    writeFileSync(path, doc.toString(), { mode: 0o600, flag: 'wx' });
  } catch (error) {
    // A concurrent init won the race: same outcome as a second run.
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return { created: false, path };
    throw error;
  }
  return { created: true, path };
}

export function loadConfig(dir: string): Config {
  const path = configPath(dir);
  if (!existsSync(path)) {
    throw new MesaError('not_found', `${path} not found; run mesa init --vault <path>`);
  }
  return validate(readYamlFile(path), path);
}

/** The config as printed by `mesa config`: every key value becomes `***`. */
export function redactConfig(config: Config): Config {
  return { ...config, keys: Object.fromEntries(Object.keys(config.keys).map((k) => [k, '***'])) };
}

/**
 * Sets one dotted path, keeping comments; the value is read as YAML (`0.5`, `true`, `[a, b]`).
 * Returns the new value, redacted under `keys`. The file is untouched when the result is invalid.
 */
export function setConfigValue(dir: string, dotted: string, value: string): unknown {
  const path = configPath(dir);
  loadConfig(dir);
  const doc = parseDocument(readFileSync(path, 'utf8'));
  const keys = dotted.split('.');
  doc.setIn(keys, parse(value));
  // `keys: {}` starts as a flow map; once it has entries, write it as a block.
  const parent = doc.getIn(keys.slice(0, -1), true);
  if (isMap(parent)) parent.flow = false;
  const next = validate(doc.toJS(), path);
  writeFileSync(path, doc.toString());
  return keys.reduce<unknown>(
    (node, k) => (node as Record<string, unknown>)?.[k],
    redactConfig(next),
  );
}

/** A key's value with `env:VAR` references read from the environment. */
export function resolveKey(
  config: Config,
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const value = config.keys[name];
  return value?.startsWith('env:') ? env[value.slice(4)] : value;
}
