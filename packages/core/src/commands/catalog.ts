import { type Dirent, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { CLAUDE_PROJECT_DIR, claudeHome, claudeSkills } from '../agents/claude/paths.js';
import { installedPlugins } from '../agents/claude/plugins.js';
import { CODEX_SKILLS, codexHome } from '../agents/codex/paths.js';
import type { Agent } from '../agents/names.js';
import type { Env } from '../lib/process.js';
import { parseNote } from '../vault/frontmatter.js';
import { builtinCommands } from './builtins.js';

export type SlashCommandSource = 'builtin' | 'user' | 'project' | 'plugin' | 'skill';
export type SlashCommand = {
  name: string;
  description: string;
  argumentHint?: string;
  source: SlashCommandSource;
};

/** Most entries one folder scan reads, so a huge or looping tree cannot stall the menu. */
const SCAN_LIMIT = 1000;

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Description and hint from frontmatter, else the first line of the body; undefined when unreadable. */
function describe(file: string) {
  try {
    const { frontmatter, body } = parseNote(readFileSync(file, 'utf8'));
    const first = body.split('\n').find((l) => l.trim() && !l.startsWith('#')) ?? '';
    const hint = text(frontmatter['argument-hint']);
    return {
      description: text(frontmatter.description) || first.trim(),
      ...(hint ? { argumentHint: hint } : {}),
      frontmatter,
    };
  } catch {
    return undefined;
  }
}

/** Every `.md` under `root` (symlinks skipped), as `ns:name` for subfolders. */
function scanCommands(root: string, prefix = ''): { name: string; file: string }[] {
  const found: { name: string; file: string }[] = [];
  const pending = [''];
  let seen = 0;
  while (pending.length && seen < SCAN_LIMIT) {
    const sub = pending.shift() as string;
    let entries: Dirent[];
    try {
      entries = readdirSync(join(root, sub), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (++seen > SCAN_LIMIT) break;
      if (e.isSymbolicLink()) continue;
      const rel = join(sub, e.name);
      if (e.isDirectory()) pending.push(rel);
      else if (e.isFile() && e.name.endsWith('.md')) {
        const ns = sub ? `${sub.split(/[\\/]/).join(':')}:` : '';
        found.push({ name: `${prefix}${ns}${basename(e.name, '.md')}`, file: join(root, rel) });
      }
    }
  }
  return found;
}

/** each folder's SKILL.md under `root`, named by the frontmatter `name` else the folder. */
function scanSkills(root: string, prefix = '', pre = ''): SlashCommand[] {
  const out: SlashCommand[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true }).slice(0, SCAN_LIMIT);
  } catch {
    return out;
  }
  for (const e of entries) {
    // Symlinks are skipped: a Dirent link is not a directory.
    if (!e.isDirectory()) continue;
    const info = describe(join(root, e.name, 'SKILL.md'));
    if (!info) continue;
    out.push({
      name: `${prefix}${text(info.frontmatter.name) || e.name}`,
      description: info.description,
      ...(info.argumentHint ? { argumentHint: info.argumentHint } : {}),
      source: 'skill',
    });
  }
  return out.map((c) => ({ ...c, name: `${pre}${c.name}` }));
}

function commandsIn(root: string, source: SlashCommandSource, prefix = ''): SlashCommand[] {
  return scanCommands(root, prefix).flatMap(({ name, file }) => {
    const info = describe(file);
    return info
      ? [
          {
            name,
            description: info.description,
            ...(info.argumentHint ? { argumentHint: info.argumentHint } : {}),
            source,
          },
        ]
      : [];
  });
}

/**
 * The slash commands an agent offers in a folder: its curated built-ins, then the person's own
 * commands and skills, project over user over plugin over built-in for one name. Claude: `.claude`
 * commands and skills (user, project, installed plugins as `plugin:name`). Codex: `~/.codex/prompts`
 * as `prompts:<name>` and skills under `.agents/skills` (a project's, then the home's).
 */
export function slashCommands(input: {
  home: string;
  env: Env;
  agent: Agent;
  projectDir?: string;
}): SlashCommand[] {
  const { home, env, agent, projectDir } = input;
  // Lowest precedence first; a later entry replaces an earlier one of the same name.
  const layers: SlashCommand[][] = [
    builtinCommands(agent).map((c) => ({ ...c, source: 'builtin' as const })),
  ];
  if (agent === 'claude') {
    const dir = claudeHome(home, env);
    for (const { name, installPath } of installedPlugins(dir, projectDir)) {
      const plugin = name.split('@')[0];
      layers.push(commandsIn(join(installPath, 'commands'), 'plugin', `${plugin}:`));
      layers.push(scanSkills(join(installPath, 'skills'), '', `${plugin}:`));
    }
    layers.push(commandsIn(join(dir, 'commands'), 'user'), scanSkills(claudeSkills(dir)));
    if (projectDir) {
      const own = join(projectDir, CLAUDE_PROJECT_DIR);
      layers.push(commandsIn(join(own, 'commands'), 'project'), scanSkills(claudeSkills(own)));
    }
  } else if (agent === 'codex') {
    layers.push(
      commandsIn(join(codexHome(home, env), 'prompts'), 'user', 'prompts:'),
      scanSkills(join(home, CODEX_SKILLS), '', '$'),
    );
    if (projectDir) layers.push(scanSkills(join(projectDir, CODEX_SKILLS), '', '$'));
  }
  const byName = new Map<string, SlashCommand>();
  for (const c of layers.flat()) byName.set(c.name, c);
  return [...byName.values()];
}
