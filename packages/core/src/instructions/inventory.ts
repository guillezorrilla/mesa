import { lstatSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Agent } from '../agents/names.js';

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

const files = (folder: string) => {
  try {
    return readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.name.endsWith('.md') && (entry.isFile() || entry.isSymbolicLink()))
      .map((entry) => join(folder, entry.name));
  } catch {
    return [];
  }
};

/** Provider instruction files already on disk. Mesa never creates a provider instruction file. */
export function instructionInventory(home: string, projectDir?: string): InstructionRow[] {
  const paths: InstructionPath[] = [
    { path: join(home, '.codex/AGENTS.md'), scope: 'global', providers: ['codex'] },
    { path: join(home, '.codex/AGENTS.override.md'), scope: 'global', providers: ['codex'] },
    { path: join(home, '.claude/CLAUDE.md'), scope: 'global', providers: ['claude'] },
    { path: join(home, '.gemini/AGENTS.md'), scope: 'global', providers: ['antigravity'] },
    { path: join(home, '.gemini/GEMINI.md'), scope: 'global', providers: ['antigravity'] },
    { path: join(home, '.gemini/config/AGENTS.md'), scope: 'global', providers: ['antigravity'] },
    { path: join(home, '.gemini/config/GEMINI.md'), scope: 'global', providers: ['antigravity'] },
    ...files(join(home, '.claude/rules')).map((path) => ({
      path,
      scope: 'global' as const,
      providers: ['claude' as const],
    })),
    ...files(join(home, '.gemini/config/rules')).map((path) => ({
      path,
      scope: 'global' as const,
      providers: ['antigravity' as const],
    })),
    ...files(join(home, '.gemini/antigravity-cli/rules')).map((path) => ({
      path,
      scope: 'global' as const,
      providers: ['antigravity' as const],
    })),
  ];
  if (projectDir) {
    paths.push(
      {
        path: join(projectDir, 'AGENTS.md'),
        scope: 'project',
        providers: ['claude', 'codex', 'antigravity'],
      },
      { path: join(projectDir, 'GEMINI.md'), scope: 'project', providers: ['antigravity'] },
      { path: join(projectDir, '.agents/AGENTS.md'), scope: 'project', providers: ['antigravity'] },
      { path: join(projectDir, '.agents/GEMINI.md'), scope: 'project', providers: ['antigravity'] },
      { path: join(projectDir, 'CLAUDE.md'), scope: 'project', providers: ['claude'] },
      { path: join(projectDir, '.claude/CLAUDE.md'), scope: 'project', providers: ['claude'] },
      ...files(join(projectDir, '.claude/rules')).map((path) => ({
        path,
        scope: 'project' as const,
        providers: ['claude' as const],
      })),
      ...files(join(projectDir, '.agents/rules')).map((path) => ({
        path,
        scope: 'project' as const,
        providers: ['antigravity' as const],
      })),
      ...files(join(projectDir, '.agent/rules')).map((path) => ({
        path,
        scope: 'project' as const,
        providers: ['antigravity' as const],
      })),
    );
  }
  const plugins = join(home, '.gemini/antigravity-cli/plugins');
  try {
    for (const plugin of readdirSync(plugins, { withFileTypes: true })) {
      if (!plugin.isDirectory()) continue;
      paths.push(
        ...files(join(plugins, plugin.name, 'rules')).map((path) => ({
          path,
          scope: 'plugin' as const,
          providers: ['antigravity' as const],
        })),
      );
    }
  } catch {
    // Plugins are optional.
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
