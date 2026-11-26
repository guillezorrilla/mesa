import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { MesaError } from '../lib/result.js';
import { parseWith } from '../lib/schema.js';
import { parseNote } from '../vault/frontmatter.js';

// The skills Mesa ships (CONTEXT.md, Skill): the repo's `skills/`, one folder per skill.

/** The skill whose run writes an Import's notes (skills/import-notes). */
export const IMPORT_NOTES = 'import-notes';
/** The skill whose run picks what a session's Vault capture saves (skills/vault-capture). */
export const VAULT_CAPTURE = 'vault-capture';

/** The skill whose run writes git text: a commit message (skills/git-text). */
export const GIT_TEXT = 'git-text';

/** The skill whose run answers a question about Cloud Logs entries (skills/cloud-logs). */
export const CLOUD_LOGS = 'cloud-logs';

/**
 * Skills Mesa's own pipelines run (an Import's notes, a Vault capture): enabled for their own
 * Skill run whatever the skills lists say, and for nothing else.
 */
export const PIPELINE_SKILLS: readonly string[] = [
  IMPORT_NOTES,
  VAULT_CAPTURE,
  GIT_TEXT,
  CLOUD_LOGS,
];

/** Whether `skill` is one of Mesa's own pipeline skills. */
export const isPipelineSkill = (skill: string) => PIPELINE_SKILLS.includes(skill);

/**
 * Whether a skill's run answers from its stdin alone, with no tool that changes a file or runs a
 * command: git-text, whose stdin holds a patch anyone could have written.
 */
export const isTextOnlySkill = (skill: string) => skill === GIT_TEXT;

/**
 * The commands a skill's run may run, when it is one of Mesa's read-only runs: cloud-logs, whose
 * stdin holds log entries anyone could have made a service print, may run Cloud Logs reads and
 * nothing else. Its Read, Grep and Glob need no rule: they read its own folder and an Ask's code
 * folder (`--add-dir`) unasked, and are refused anywhere else.
 */
export const readOnlyTools = (skill: string): readonly string[] | undefined =>
  skill === CLOUD_LOGS
    ? ['Bash(mesa logs gcp:*)', 'Bash(mesa logs errors:*)', 'Bash(mesa logs counts:*)']
    : undefined;

/** The built-in tools a read-only run has at all: no edit, write, web or subagent tool exists for it. */
export const READ_ONLY_RUN_TOOLS: readonly string[] = ['Bash', 'Read', 'Grep', 'Glob'];

/** Files of a project a read-only run never reads, however its code folder is read: its secrets. */
const SECRET_FILES = [
  '.env*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  '*.keystore',
  '*.jks',
  'id_rsa*',
  'id_ed25519*',
  '*credentials*',
  'secrets/**',
  '.git/config',
  '.npmrc',
  '.netrc',
  '.pgpass',
];

/** The deny rules that keep a read-only run's file tools off the secrets under `folder`. */
export const secretDenies = (folder: string) =>
  ['Read', 'Grep', 'Glob'].flatMap((tool) =>
    // `//` starts an absolute path in a Claude Code rule.
    SECRET_FILES.map((file) => `${tool}(/${folder}/**/${file})`),
  );

/** The skill whose run summarises a session's output log (skills/session-summary). */
export const SESSION_SUMMARY = 'session-summary';

/**
 * How each of Mesa's own Claude skill runs starts, instead of with the person's default model and
 * full setup (ADR-0012 amendment, ADR-0023, docs/spikes/token-usage.md): `model`, the cheapest that
 * does the job (Haiku, about a twentieth of Opus's cost per run, for short text from given input;
 * Sonnet for import notes, which read and write several vault notes); `vault`, whether it may run
 * Mesa's vault commands unasked (mesa-commands.ts), with none of the person's MCP servers, user
 * settings, plugins or hooks; and `effort`, low where it only writes short text. Any other skill runs as
 * the person's sessions do.
 */
export type ClaudeRunProfile = { model: string; vault: boolean; effort?: 'low' };
const RUN_PROFILES: Readonly<Record<string, ClaudeRunProfile>> = {
  [VAULT_CAPTURE]: { model: 'haiku', vault: true },
  [GIT_TEXT]: { model: 'haiku', vault: false, effort: 'low' },
  [SESSION_SUMMARY]: { model: 'haiku', vault: false, effort: 'low' },
  [IMPORT_NOTES]: { model: 'sonnet', vault: true },
  // Sonnet: it reasons over up to 60 KB of entries rather than writing short text.
  [CLOUD_LOGS]: { model: 'sonnet', vault: false, effort: 'low' },
};
export const claudeRunProfile = (skill: string): ClaudeRunProfile | undefined =>
  Object.hasOwn(RUN_PROFILES, skill) ? RUN_PROFILES[skill] : undefined;

/** A skill's own file, read by both agents. */
const SKILL_FILE = 'SKILL.md';

/** The frontmatter Claude Code and Codex both read. */
const SkillFrontmatterSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'a lowercase slug'),
  description: z.string().min(1),
});

export type LibrarySkill = { name: string; description: string; path: string };

/** A skill folder's SKILL.md frontmatter, or undefined when it has none that reads. */
export function readSkill(
  folder: string,
  requireName = false,
): { name: string; description: string } | undefined {
  const file = join(folder, SKILL_FILE);
  if (!existsSync(file)) return undefined;
  const frontmatter = parseNote(readFileSync(file, 'utf8')).frontmatter;
  if (requireName && !frontmatter.name) return undefined;
  const parsed = SkillFrontmatterSchema.safeParse({
    ...frontmatter,
    name: frontmatter.name ?? basename(folder),
  });
  return parsed.success ? parsed.data : undefined;
}

/**
 * Every skill in the library `dir`, by name. A folder whose SKILL.md is missing, does not read,
 * or names another skill is invalid_config: Mesa never ships a skill an agent cannot load.
 */
export function readLibrary(dir: string): LibrarySkill[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const path = join(dir, e.name);
      const file = join(path, SKILL_FILE);
      const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
      const skill = parseWith(SkillFrontmatterSchema, parseNote(text).frontmatter, file);
      if (skill.name !== e.name) {
        throw new MesaError('invalid_config', `${file}: name is ${skill.name}, not ${e.name}`);
      }
      return { ...skill, path };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
