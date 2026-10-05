import { lstatSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  ANTIGRAVITY_PROJECT_INSTRUCTIONS,
  ANTIGRAVITY_PROJECT_RULES,
  antigravityInstructions,
  antigravityPlugins,
  antigravityRules,
} from '../agents/antigravity/paths.js';
import {
  CLAUDE_PROJECT_DIR,
  claudeHome,
  claudeMemory,
  claudeRules,
} from '../agents/claude/paths.js';
import { codexHome, codexInstructions, codexInstructionsOverride } from '../agents/codex/paths.js';
import type { Agent } from '../agents/names.js';
import type { Env } from '../lib/process.js';

export type InstructionRow = {
  id: string;
  name: string;
  path: string;
  scope: 'project' | 'global' | 'plugin';
  providers: Agent[];
  writable: boolean;
  readOnlyReason?: string;
};

type InstructionPath = Pick<InstructionRow, 'scope' | 'providers'> & { path: string };

const entries = (folder: string) => {
  try {
    return readdirSync(folder, { withFileTypes: true });
  } catch {
    return [];
  }
};

/** The `.md` files in `folder`, linked ones too; none when it does not open. */
const files = (folder: string) =>
  entries(folder)
    .filter((entry) => entry.name.endsWith('.md') && (entry.isFile() || entry.isSymbolicLink()))
    .map((entry) => join(folder, entry.name));

/** Each of `paths` as an instruction source of `scope`, read by `providers`. */
const sources = (
  paths: string[],
  scope: InstructionRow['scope'],
  providers: Agent[],
): InstructionPath[] => paths.map((path) => ({ path, scope, providers }));

/**
 * Provider instruction files already on disk: in each provider's home (Claude's and Codex's where
 * `env` puts them, as the agents read them there), in `projectDir`, and in Antigravity's plugins.
 * Mesa never creates a provider instruction file.
 */
export function instructionInventory(
  home: string,
  env: Env,
  projectDir?: string,
): InstructionRow[] {
  const claude = claudeHome(env, home);
  const codex = codexHome(env, home);
  const paths: InstructionPath[] = [
    ...sources([codexInstructions(codex), codexInstructionsOverride(codex)], 'global', ['codex']),
    ...sources([claudeMemory(claude), ...files(claudeRules(claude))], 'global', ['claude']),
    ...sources(
      [...antigravityInstructions(home), ...antigravityRules(home).flatMap(files)],
      'global',
      ['antigravity'],
    ),
  ];
  if (projectDir) {
    const claudeProject = join(projectDir, CLAUDE_PROJECT_DIR);
    paths.push(
      ...sources([join(projectDir, 'AGENTS.md')], 'project', ['claude', 'codex', 'antigravity']),
      ...sources(
        [
          claudeMemory(projectDir),
          claudeMemory(claudeProject),
          ...files(claudeRules(claudeProject)),
        ],
        'project',
        ['claude'],
      ),
      ...sources(
        [
          ...ANTIGRAVITY_PROJECT_INSTRUCTIONS.map((path) => join(projectDir, path)),
          ...ANTIGRAVITY_PROJECT_RULES.flatMap((path) => files(join(projectDir, path))),
        ],
        'project',
        ['antigravity'],
      ),
    );
  }
  const plugins = antigravityPlugins(home);
  for (const plugin of entries(plugins)) {
    if (plugin.isDirectory())
      paths.push(...sources(files(join(plugins, plugin.name, 'rules')), 'plugin', ['antigravity']));
  }
  return paths
    .flatMap((source) => {
      const stat = lstatSync(source.path, { throwIfNoEntry: false });
      if (!stat || (!stat.isFile() && !stat.isSymbolicLink())) return [];
      const writable = source.scope !== 'plugin' && stat.isFile();
      return [
        {
          id: source.path,
          name: basename(source.path),
          ...source,
          writable,
          ...(!writable
            ? {
                readOnlyReason:
                  source.scope === 'plugin'
                    ? 'Managed by a provider plugin'
                    : 'Linked instruction file',
              }
            : {}),
        },
      ];
    })
    .sort((a, b) => a.scope.localeCompare(b.scope) || a.name.localeCompare(b.name));
}
