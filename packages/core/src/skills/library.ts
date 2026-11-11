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

/**
 * Skills Mesa's own pipelines run (an Import's notes, a Vault capture): enabled for their own
 * Skill run whatever the skills lists say, and for nothing else.
 */
export const PIPELINE_SKILLS: readonly string[] = [IMPORT_NOTES, VAULT_CAPTURE, GIT_TEXT];

/** Whether `skill` is one of Mesa's own pipeline skills. */
export const isPipelineSkill = (skill: string) => PIPELINE_SKILLS.includes(skill);

/**
 * Whether a skill's run answers from its stdin alone, with no tool that changes a file or runs a
 * command: git-text, whose stdin holds a patch anyone could have written.
 */
export const isTextOnlySkill = (skill: string) => skill === GIT_TEXT;

/** The skill whose run summarises a session's output log (skills/session-summary). */
export const SESSION_SUMMARY = 'session-summary';

/**
 * The Claude model each of Mesa's own skill runs uses instead of the person's default: the
 * cheapest that does the job (ADR-0023, docs/spikes/token-usage.md). Haiku, about a twentieth of
 * Opus's cost per run, for short text from given input; Sonnet for import notes, which read and
 * write several vault notes. Any other skill runs on the person's default.
 */
const RUN_MODELS: Readonly<Record<string, 'haiku' | 'sonnet'>> = {
  [VAULT_CAPTURE]: 'haiku',
  [GIT_TEXT]: 'haiku',
  [SESSION_SUMMARY]: 'haiku',
  [IMPORT_NOTES]: 'sonnet',
};
export const claudeRunModel = (skill: string) =>
  Object.hasOwn(RUN_MODELS, skill) ? RUN_MODELS[skill] : undefined;

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
