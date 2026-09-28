import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { MesaError } from '../lib/result.js';
import { parseWith } from '../lib/schema.js';
import { parseNote } from '../vault/frontmatter.js';

// The skills Mesa ships (CONTEXT.md, Skill): the repo's `skills/`, one folder per skill.

/** A skill's own file, read by both agents. */
const SKILL_FILE = 'SKILL.md';

/** The frontmatter Claude Code and Codex both read. */
const SkillFrontmatterSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'a lowercase slug'),
  description: z.string().min(1),
});

export type LibrarySkill = { name: string; description: string; path: string };

/** A skill folder's SKILL.md frontmatter, or undefined when it has none that reads. */
export function readSkill(folder: string): { name: string; description: string } | undefined {
  const file = join(folder, SKILL_FILE);
  if (!existsSync(file)) return undefined;
  const frontmatter = parseNote(readFileSync(file, 'utf8')).frontmatter;
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
