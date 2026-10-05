import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';
import { z } from 'zod';
import { AgentSchema } from '../agents/agents.js';
import { LaunchDefaultsSchema } from '../agents/launch-flags.js';
import { CLAUDE_PERMISSION_MODES, DEFAULT_AGENT } from '../agents/names.js';
import { DecisionsBackendSchema } from '../decisions/types.js';
import { validExternalArgv } from '../files/external.js';
import type { Env } from '../lib/process.js';
import { REDACTED } from '../lib/redact.js';
import { MesaError } from '../lib/result.js';
import { parseWith } from '../lib/schema.js';
import { readYaml, setYamlPath, valueAt } from '../lib/yaml-file.js';
import {
  BOARD_DENSITIES,
  BOARD_GROUPS,
  BOARD_SORTS,
  BOARD_VIEWS,
  DEFAULT_BOARD_PREFERENCES,
} from '../sessions/presentation.js';
import { UPDATE_CHANNELS } from '../update/feeds.js';
import { WORKTREE_OVERRIDE_FIELDS } from '../worktrees/fields.js';
import {
  COLOR_VISION_MODES,
  DEFAULT_APPEARANCE,
  DEFAULT_TERMINAL_PREFERENCES,
  INTERFACE_DENSITIES,
  INTERFACE_FONTS,
  INTERFACE_THEMES,
  PROJECT_SORTS,
  TERMINAL_APPS,
  TERMINAL_THEMES,
} from './preferences.js';
import { DEFAULT_SHORTCUTS, validShortcut } from './shortcuts.js';

/** The terminal apps `mesa attach --app` can open. */
export { TERMINAL_APPS } from './preferences.js';
export type TerminalApp = (typeof TERMINAL_APPS)[number];

/**
 * A file written before ADR-0020 may still name Faro's removed adapter, as
 * `decisions.backend: adapter` or `decisions.adapter`: it loads, and acts as rules.
 */
const withoutAdapter = (decisions: unknown) => {
  if (!decisions || typeof decisions !== 'object') return decisions;
  const { adapter: _, ...rest } = decisions as Record<string, unknown>;
  return rest.backend === 'adapter' ? { ...rest, backend: 'rules' } : rest;
};

// Strict objects, so a typo in the file or in `mesa config set` is an error, not a silent no-op.
const ConfigSchema = z.strictObject({
  vault: z.string().refine(isAbsolute, 'must be an absolute path'),
  defaultAgent: AgentSchema.default(DEFAULT_AGENT),
  // The mesa skill teaches every agent Mesa starts to drive Mesa (skills/mesa), and mesa-vault
  // to read and save the profile vault's knowledge (skills/mesa-vault).
  skills: z.array(z.string()).default(['mesa', 'mesa-handoff', 'mesa-vault']),
  decisions: z
    .preprocess(
      withoutAdapter,
      z.strictObject({
        backend: DecisionsBackendSchema.default('rules'),
        threshold: z.number().min(0).max(1).default(0.7),
      }),
    )
    .prefault({}),
  sessions: z
    .strictObject({
      log: z.boolean().default(true),
      // Claude's status line in Mesa sessions ends with the session's estimated cost.
      statusLineCost: z.boolean().default(false),
      /** Forward PR events into their sessions (CONTEXT.md, PR event). */
      prEvents: z.boolean().default(false),
    })
    .prefault({}),
  usage: z
    .strictObject({
      dailyAlertUsd: z.number().finite().nonnegative().default(0),
      weeklyAlertUsd: z.number().finite().nonnegative().default(0),
      monthlyAlertUsd: z.number().finite().nonnegative().default(0),
    })
    .prefault({}),
  notifications: z
    .strictObject({
      quiet: z.boolean().default(false),
      // The Dock badge and the sidebar's dot while sessions wait for input.
      visualAlert: z.boolean().default(true),
      inputRequired: z.enum(['off', 'silent', 'sound']).default('sound'),
      finished: z.enum(['off', 'silent', 'sound']).default('silent'),
      subagent: z.enum(['off', 'silent', 'sound']).default('silent'),
      doctor: z.enum(['off', 'silent', 'sound']).default('silent'),
      automation: z.enum(['off', 'silent', 'sound']).default('silent'),
    })
    .prefault({}),
  application: z
    .strictObject({
      warnBeforeQuit: z.boolean().default(true),
      backupOnClose: z.boolean().default(false),
    })
    .prefault({}),
  onboarding: z
    .strictObject({
      status: z.enum(['active', 'complete']).default('complete'),
      step: z.number().int().min(0).max(2).default(0),
      // First-run discovery (CONTEXT.md): offered at launch while pending with no projects, or started.
      discovery: z.enum(['pending', 'started', 'complete', 'dismissed']).default('pending'),
    })
    .prefault({}),
  appearance: z
    .strictObject({
      theme: z.enum(INTERFACE_THEMES).default(DEFAULT_APPEARANCE.theme),
      font: z.enum(INTERFACE_FONTS).default(DEFAULT_APPEARANCE.font),
      fontSize: z.number().int().min(12).max(20).default(DEFAULT_APPEARANCE.fontSize),
      diffFontSize: z.number().int().min(10).max(20).default(DEFAULT_APPEARANCE.diffFontSize),
      fileTreeFontSize: z
        .number()
        .int()
        .min(10)
        .max(20)
        .default(DEFAULT_APPEARANCE.fileTreeFontSize),
      density: z.enum(INTERFACE_DENSITIES).default(DEFAULT_APPEARANCE.density),
      colorVision: z.enum(COLOR_VISION_MODES).default(DEFAULT_APPEARANCE.colorVision),
    })
    .prefault({}),
  terminal: z
    .strictObject({
      app: z.enum(TERMINAL_APPS).default('Terminal'),
      theme: z.enum(TERMINAL_THEMES).default(DEFAULT_TERMINAL_PREFERENCES.theme),
      fontSize: z.number().int().min(10).max(24).default(DEFAULT_TERMINAL_PREFERENCES.fontSize),
      fontFamily: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .default(DEFAULT_TERMINAL_PREFERENCES.fontFamily),
      optionAsMeta: z.boolean().default(DEFAULT_TERMINAL_PREFERENCES.optionAsMeta),
      naturalSelection: z.boolean().default(DEFAULT_TERMINAL_PREFERENCES.naturalSelection),
      scrollSpeed: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(DEFAULT_TERMINAL_PREFERENCES.scrollSpeed),
      extraSubmitKey: z
        .enum(['none', 'cmd-enter'])
        .default(DEFAULT_TERMINAL_PREFERENCES.extraSubmitKey),
      newlineKey: z
        .enum(['native', 'shift-enter'])
        .default(DEFAULT_TERMINAL_PREFERENCES.newlineKey),
      wezTermNewTab: z.boolean().default(DEFAULT_TERMINAL_PREFERENCES.wezTermNewTab),
      // Copy and Review over a session terminal on hover, for the agent's latest response.
      messageActions: z.boolean().default(DEFAULT_TERMINAL_PREFERENCES.messageActions),
    })
    .prefault({}),
  editor: z
    .strictObject({
      fontSize: z.number().int().min(10).max(24).default(13),
      tabSize: z.number().int().min(2).max(8).default(2),
      wordWrap: z.boolean().default(false),
      vim: z.boolean().default(false),
      external: z
        .array(z.string().min(1))
        .max(16)
        .refine(
          (argv) => !argv.length || validExternalArgv(argv),
          'must be an absolute executable argv with one {file} argument',
        )
        .default([]),
    })
    .prefault({}),
  worktrees: z
    .strictObject({
      location: z.enum(['profile', 'sibling', 'nested', 'custom']).default('profile'),
      customRoot: z.string().refine(isAbsolute, 'must be an absolute path').optional(),
      base: WORKTREE_OVERRIDE_FIELDS.base.optional(),
      fetch: WORKTREE_OVERRIDE_FIELDS.fetch.default(false),
      sparseDirectories: WORKTREE_OVERRIDE_FIELDS.sparseDirectories.default([]),
      carryIgnoredDirectories: WORKTREE_OVERRIDE_FIELDS.carryIgnoredDirectories.default([]),
      setup: WORKTREE_OVERRIDE_FIELDS.setup.default([]),
      teardown: WORKTREE_OVERRIDE_FIELDS.teardown.default([]),
      // Pre-checks "also delete branch" when the app removes a session's worktree.
      deleteBranch: z.boolean().default(false),
    })
    .refine(
      (settings) => settings.location !== 'custom' || settings.customRoot,
      'customRoot is required for custom location',
    )
    .prefault({}),
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
  // The sidebar's project order, and `mesa projects` without --sort.
  projects: z.strictObject({ sort: z.enum(PROJECT_SORTS).default('name') }).prefault({}),
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
  grid: z
    .strictObject({
      groups: z
        .array(
          z.strictObject({
            name: z.string().trim().min(1).max(60),
            project: z.string().optional(),
            sessions: z.array(z.string().regex(/^[0-9a-z]{8}$/)).min(1),
          }),
        )
        .refine(
          (groups) =>
            new Set(groups.map((group) => group.name.toLowerCase())).size === groups.length,
          'grid group names must be unique',
        )
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
  /** Each agent's native launch flags on new and resumed sessions; unset uses its native config. */
  agents: LaunchDefaultsSchema,
  /** Which releases Mesa updates to (ADR-0018); unset follows the running version's channel. */
  update: z.strictObject({ channel: z.enum(UPDATE_CHANNELS).optional() }).prefault({}),
  /** Name to a literal value or an `env:VAR` reference. Never printed in the clear. */
  keys: z.record(z.string(), z.string()).default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
const BackupSettingsSchema = ConfigSchema.omit({ vault: true, keys: true });
export type BackupSettings = z.infer<typeof BackupSettingsSchema>;
export const buildBackupSettings = (input: unknown, file: string): BackupSettings =>
  parseWith(BackupSettingsSchema, input, file);

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
  /** Throws to refuse the new config, before anything is written. */
  check?: (next: Config) => void,
): { value: unknown; changed: boolean } {
  const before = currentValue(file, dotted);
  const next = setYamlPath(file, ConfigSchema, dotted, parse(value), check);
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
