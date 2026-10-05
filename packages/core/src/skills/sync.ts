import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { CLAUDE_PROJECT_SKILLS } from '../agents/claude/paths.js';
import { CODEX_SKILLS } from '../agents/codex/paths.js';
import { excludeFromGit } from '../git/exclude.js';
import { type LibrarySkill, readSkill } from './library.js';

/** Where each agent looks for a project's skills: Claude Code's, then Codex's. */
const SKILL_DIRS = [CLAUDE_PROJECT_SKILLS, CODEX_SKILLS];

/** One skill as a project sees it: Mesa's (from the library) or the project's own. */
export type SkillRow = {
  name: string;
  source: 'mesa' | 'repo';
  enabled: boolean;
  description: string;
  /** With a project: whether Mesa's link to it is in the project (synced). */
  linked?: boolean;
};

/** What a sync did, per link: `<skill dir>/<name>`, relative to the project. */
export type SkillSync = {
  added: string[];
  removed: string[];
  kept: string[];
  /** An entry of the project's own where a Mesa skill would go: left alone. */
  conflicts: string[];
  /** Enabled names the library does not have. */
  unknown: string[];
};

/** Whether `entry` is a link Mesa made: a symlink that resolves inside the library. */
function isMesaLink(entry: string, library: string): boolean {
  if (!lstatSync(entry, { throwIfNoEntry: false })?.isSymbolicLink()) return false;
  const target = resolve(dirname(entry), readlinkSync(entry));
  const root = existsSync(library) ? realpathSync(library) : resolve(library);
  // A link into a folder the library no longer has still resolves inside it, by its path.
  const real = existsSync(target) ? realpathSync(target) : target;
  return real === root || real.startsWith(`${root}${sep}`);
}

/** The skill every Mesa library has shipped, which marks a folder as one. */
const LIBRARY_MARK = 'mesa';

/**
 * Whether `entry` is a link an earlier Mesa library made (another checkout's, often deleted
 * since): absolute, as Mesa makes them, to `<library>/<the same name>` in a folder named
 * `skills`, and gone, or beside that library's own LIBRARY_MARK skill. A link the project or the
 * user made (relative, to another name, or into a folder that is not a Mesa library) is not one.
 */
function isStaleMesaLink(entry: string): boolean {
  if (!lstatSync(entry, { throwIfNoEntry: false })?.isSymbolicLink()) return false;
  const target = readlinkSync(entry);
  const library = dirname(target);
  if (!isAbsolute(target) || basename(target) !== basename(entry)) return false;
  if (basename(library) !== 'skills') return false;
  return !existsSync(target) || existsSync(join(library, LIBRARY_MARK, 'SKILL.md'));
}

/** Whether `entry` is Mesa's: a link into this library, or one an earlier library made. */
const madeByMesa = (entry: string, library: string) =>
  isMesaLink(entry, library) || isStaleMesaLink(entry);

/**
 * The project's skill folders, each once: a folder that is another's alias (`.claude/skills` a
 * link to `.agents/skills`, as some repos keep them) is the same place, so it is skipped.
 */
function skillFolders(projectDir: string) {
  const seen = new Set<string>();
  return SKILL_DIRS.flatMap((dir) => {
    const folder = join(projectDir, dir);
    const real = existsSync(folder) ? realpathSync(folder) : folder;
    if (seen.has(real)) return [];
    seen.add(real);
    return [{ dir, folder }];
  });
}

/**
 * The skills a project sees: the library's, enabled when the profile or the project's mesa.yaml
 * names them, then the project's own (entries in its skill folders Mesa did not make), enabled.
 */
export function listSkills(input: {
  library: readonly LibrarySkill[];
  libraryDir: string;
  enabled: ReadonlySet<string>;
  projectDir?: string;
}): SkillRow[] {
  const { projectDir } = input;
  const linked = (name: string) =>
    Boolean(projectDir) &&
    SKILL_DIRS.some((dir) => isMesaLink(join(projectDir as string, dir, name), input.libraryDir));
  const rows: SkillRow[] = input.library.map((s) => ({
    name: s.name,
    source: 'mesa',
    enabled: input.enabled.has(s.name),
    description: s.description,
    ...(projectDir ? { linked: linked(s.name) } : {}),
  }));
  if (!projectDir) return rows;
  const seen = new Set<string>();
  for (const { folder } of skillFolders(projectDir)) {
    if (!existsSync(folder)) continue;
    for (const name of readdirSync(folder)) {
      const entry = join(folder, name);
      if (seen.has(name) || madeByMesa(entry, input.libraryDir)) continue;
      seen.add(name);
      let own: ReturnType<typeof readSkill>;
      try {
        own = readSkill(entry);
      } catch {
        // A broken user-owned skill stays visible without hiding the rest of the list.
      }
      rows.push({ name, source: 'repo', enabled: true, description: own?.description ?? '' });
    }
  }
  return rows;
}

/**
 * Links the enabled library skills into the project's `.claude/skills` and `.agents/skills`,
 * repointing a link an earlier library made (isStaleMesaLink), and removes the links Mesa made for
 * skills no longer enabled. An entry Mesa did not make is never touched: one where a Mesa skill
 * would go is a conflict.
 */
export function syncSkills(input: {
  library: readonly LibrarySkill[];
  libraryDir: string;
  enabled: ReadonlySet<string>;
  projectDir: string;
}): SkillSync {
  const byName = new Map(input.library.map((s) => [s.name, s]));
  const wanted = [...input.enabled].filter((n) => byName.has(n)).sort();
  const done: SkillSync = {
    added: [],
    removed: [],
    kept: [],
    conflicts: [],
    unknown: [...input.enabled].filter((n) => !byName.has(n)).sort(),
  };
  for (const { dir, folder } of skillFolders(input.projectDir)) {
    for (const name of wanted) {
      const entry = join(folder, name);
      const label = `${dir}/${name}`;
      if (isMesaLink(entry, input.libraryDir)) {
        done.kept.push(label);
      } else if (isStaleMesaLink(entry) || !lstatSync(entry, { throwIfNoEntry: false })) {
        // An earlier library's link goes, so the agent finds this one's skill.
        rmSync(entry, { force: true });
        mkdirSync(folder, { recursive: true });
        symlinkSync((byName.get(name) as LibrarySkill).path, entry);
        done.added.push(label);
      } else {
        done.conflicts.push(label);
      }
    }
    if (!existsSync(folder)) continue;
    for (const name of readdirSync(folder).sort()) {
      const entry = join(folder, name);
      if (!wanted.includes(name) && madeByMesa(entry, input.libraryDir)) {
        unlinkSync(entry);
        done.removed.push(`${dir}/${name}`);
      }
    }
  }
  // Every link Mesa has in the project, new or kept, so git never counts them as the project's.
  excludeFromGit(input.projectDir, [...done.added, ...done.kept]);
  return done;
}
