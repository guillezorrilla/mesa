import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { Agent } from '../agents/names.js';
import type { LibrarySkill } from './library.js';
import { readSkill } from './library.js';
import type { SkillRow } from './sync.js';

export type SkillInventoryRow = Omit<SkillRow, 'source'> & {
  id: string;
  path: string;
  scope: 'project' | 'global' | 'plugin' | 'mesa';
  source: 'mesa' | 'repo' | 'global' | 'plugin';
  providers: Agent[];
  supportFiles: string[];
  writable: boolean;
  readOnlyReason?: string;
  invalidReason?: string;
  conflicts: string[];
};

type Root = {
  path: string;
  scope: SkillInventoryRow['scope'];
  providers: Agent[];
};

const entries = (folder: string) => {
  try {
    return readdirSync(folder, { withFileTypes: true });
  } catch {
    return [];
  }
};

function supportFiles(folder: string): string[] {
  const files: string[] = [];
  const pending = [''];
  while (pending.length && files.length < 32) {
    const prefix = pending.shift() as string;
    for (const entry of entries(join(folder, prefix))) {
      const path = join(prefix, entry.name);
      if (path === 'SKILL.md' || entry.isSymbolicLink()) continue;
      if (entry.isFile()) files.push(path);
      if (entry.isDirectory()) pending.push(path);
      if (files.length >= 32) break;
    }
  }
  return files.sort();
}

function nativeRoots(home: string, projectDir?: string): Root[] {
  const roots: Root[] = [
    { path: join(home, '.claude/skills'), scope: 'global', providers: ['claude'] },
    { path: join(home, '.agents/skills'), scope: 'global', providers: ['codex'] },
    {
      path: join(home, '.gemini/antigravity-cli/skills'),
      scope: 'global',
      providers: ['antigravity'],
    },
  ];
  if (projectDir) {
    roots.unshift(
      { path: join(projectDir, '.claude/skills'), scope: 'project', providers: ['claude'] },
      {
        path: join(projectDir, '.agents/skills'),
        scope: 'project',
        providers: ['codex', 'antigravity'],
      },
      { path: join(projectDir, '.agent/skills'), scope: 'project', providers: ['antigravity'] },
    );
  }
  const plugins = join(home, '.gemini/antigravity-cli/plugins');
  for (const plugin of entries(plugins)) {
    if (plugin.isDirectory()) {
      roots.push({
        path: join(plugins, plugin.name, 'skills'),
        scope: 'plugin',
        providers: ['antigravity'],
      });
    }
  }
  return roots;
}

/** Installed skill paths, with collisions left visible rather than guessing provider precedence. */
export function skillInventory(input: {
  home: string;
  library: LibrarySkill[];
  listed: SkillRow[];
  projectDir?: string;
}): SkillInventoryRow[] {
  const byName = new Map(input.library.map((skill) => [skill.name, skill]));
  const rows: SkillInventoryRow[] = input.listed
    .filter((row) => row.source === 'mesa')
    .map((row) => {
      const path = byName.get(row.name)?.path ?? '';
      return {
        ...row,
        id: path,
        path,
        scope: 'mesa',
        providers: ['claude', 'codex', 'antigravity'],
        supportFiles: supportFiles(path),
        writable: false,
        readOnlyReason: 'Mesa ships this skill',
        conflicts: [],
      };
    });
  const seen = new Map<string, SkillInventoryRow>();
  for (const root of nativeRoots(input.home, input.projectDir)) {
    for (const entry of entries(root.path)) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const path = join(root.path, entry.name);
      let canonical: string;
      try {
        canonical = realpathSync.native(path);
      } catch {
        continue;
      }
      const librarySkill = [...byName.values()].some((skill) => skill.path === canonical);
      if (librarySkill) continue;
      const existing = seen.get(canonical);
      if (existing) {
        existing.providers = [...new Set([...existing.providers, ...root.providers])];
        continue;
      }
      const file = join(path, 'SKILL.md');
      const fileIsRegular = lstatSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
      let skill: ReturnType<typeof readSkill>;
      let invalidReason: string | undefined;
      try {
        if (fileIsRegular) skill = readSkill(path);
      } catch {
        invalidReason = 'SKILL.md has invalid metadata';
      }
      if (fileIsRegular && !skill) invalidReason = 'SKILL.md has invalid metadata';
      if (!fileIsRegular) invalidReason = 'Missing or linked SKILL.md';
      const writable = root.scope !== 'plugin' && !entry.isSymbolicLink() && fileIsRegular;
      const row: SkillInventoryRow = {
        id: path,
        name: skill?.name ?? entry.name,
        description: skill?.description ?? '',
        source: root.scope === 'project' ? 'repo' : root.scope,
        scope: root.scope,
        path,
        providers: [...root.providers],
        enabled: Boolean(skill),
        ...(invalidReason ? { invalidReason } : {}),
        supportFiles: supportFiles(path),
        writable,
        ...(!writable
          ? {
              readOnlyReason: !fileIsRegular
                ? 'Missing or linked SKILL.md'
                : root.scope === 'plugin'
                  ? 'Managed by a provider plugin'
                  : 'Linked skill folder',
            }
          : {}),
        conflicts: [],
      };
      seen.set(canonical, row);
      rows.push(row);
    }
  }
  for (const row of rows) {
    row.conflicts = rows
      .filter(
        (other) =>
          other !== row &&
          other.name === row.name &&
          other.providers.some((agent) => row.providers.includes(agent)) &&
          other.path !== row.path,
      )
      .map((other) => other.path);
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}
