import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { parse } from 'smol-toml';
import type { Agent } from '../agents/names.js';
import { MesaError } from '../lib/result.js';
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
  disabledFor: Agent[];
  precedence: 'only-discovered-source' | 'provider-native';
};

type Root = {
  path: string;
  scope: SkillInventoryRow['scope'];
  providers: Agent[];
  disabled?: boolean;
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
  while (pending.length) {
    const prefix = pending.shift() as string;
    for (const entry of entries(join(folder, prefix))) {
      const path = join(prefix, entry.name);
      if (path === 'SKILL.md' || entry.isSymbolicLink()) continue;
      if (entry.isFile()) files.push(path);
      if (entry.isDirectory()) pending.push(path);
    }
  }
  return files.sort();
}

function claudeSettings(home: string): Record<string, unknown> {
  try {
    const settings: unknown = JSON.parse(readFileSync(join(home, '.claude/settings.json'), 'utf8'));
    return settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function nativeRoots(
  home: string,
  projectDir?: string,
  enabledPlugins?: Record<string, unknown>,
): Root[] {
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
  const installed = join(home, '.claude/plugins/installed_plugins.json');
  if (existsSync(installed)) {
    let metadata: unknown;
    try {
      metadata = JSON.parse(readFileSync(installed, 'utf8'));
    } catch {
      metadata = undefined;
    }
    const plugins =
      metadata && typeof metadata === 'object' && 'plugins' in metadata
        ? metadata.plugins
        : undefined;
    if (plugins && typeof plugins === 'object') {
      for (const [name, installs] of Object.entries(plugins)) {
        if (!Array.isArray(installs)) continue;
        for (const install of installs) {
          if (!install || typeof install !== 'object') continue;
          const { scope, projectPath, installPath } = install as {
            scope?: unknown;
            projectPath?: unknown;
            installPath?: unknown;
          };
          if (
            typeof installPath === 'string' &&
            isAbsolute(installPath) &&
            (scope === 'user' ||
              ((scope === 'project' || scope === 'local') &&
                projectDir &&
                typeof projectPath === 'string' &&
                resolve(projectPath) === resolve(projectDir)))
          ) {
            roots.push({
              path: join(installPath, 'skills'),
              scope: 'plugin',
              providers: ['claude'],
              disabled: enabledPlugins?.[name] === false,
            });
          }
        }
      }
    }
  }
  return roots;
}

/** Codex's own disabled-skill policy; Mesa reads it without changing provider settings. */
function codexDisabledSkills(config?: string): Set<string> {
  if (!config || !existsSync(config)) return new Set();
  let entries: unknown;
  try {
    entries = parse(readFileSync(config, 'utf8')).skills;
  } catch {
    // Keep the reason free of config contents, which may contain credentials.
    throw new MesaError('invalid_config', `${config}: cannot read Codex skill configuration`);
  }
  const configs =
    entries && typeof entries === 'object' && 'config' in entries ? entries.config : undefined;
  if (!Array.isArray(configs)) return new Set();
  return new Set(
    configs
      .filter(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          entry.enabled === false &&
          typeof entry.path === 'string' &&
          isAbsolute(entry.path),
      )
      .map((entry) => {
        const path = resolve(entry.path);
        return existsSync(path) ? realpathSync.native(path) : path;
      }),
  );
}

/** Installed skill paths, with collisions left visible rather than guessing provider precedence. */
export function skillInventory(input: {
  home: string;
  library: LibrarySkill[];
  listed: SkillRow[];
  projectDir?: string;
  codexConfig?: string;
}): SkillInventoryRow[] {
  const disabled = codexDisabledSkills(input.codexConfig);
  const claude = claudeSettings(input.home);
  const enabledPlugins =
    claude.enabledPlugins && typeof claude.enabledPlugins === 'object'
      ? (claude.enabledPlugins as Record<string, unknown>)
      : {};
  const skillOverrides =
    claude.skillOverrides && typeof claude.skillOverrides === 'object'
      ? (claude.skillOverrides as Record<string, unknown>)
      : {};
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
        disabledFor: [],
        precedence: 'only-discovered-source',
      };
    });
  const seen = new Map<string, SkillInventoryRow>();
  for (const root of nativeRoots(input.home, input.projectDir, enabledPlugins)) {
    for (const entry of entries(root.path)) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const path = join(root.path, entry.name);
      let canonical: string;
      try {
        canonical = realpathSync.native(path);
        // A link to a file (a README beside the skills) is not a skill folder.
        if (!statSync(canonical).isDirectory()) continue;
      } catch {
        continue;
      }
      const librarySkill = [...byName.values()].some((skill) => skill.path === canonical);
      if (librarySkill) continue;
      const existing = seen.get(canonical);
      if (existing) {
        existing.providers = [...new Set([...existing.providers, ...root.providers])];
        if (root.disabled)
          existing.disabledFor = [...new Set([...existing.disabledFor, ...root.providers])];
        continue;
      }
      const file = join(path, 'SKILL.md');
      const skillFile = lstatSync(file, { throwIfNoEntry: false });
      // A folder without SKILL.md is not a skill (global roots can contain sync buckets).
      if (!skillFile) continue;
      // A linked SKILL.md (stow --no-folding) is read through its link, and never written.
      const linkedFile = skillFile.isSymbolicLink();
      let readable = false;
      try {
        readable = statSync(file).isFile();
      } catch {
        // A broken or looping link reads as nothing.
      }
      let skill: ReturnType<typeof readSkill>;
      let invalidReason: string | undefined;
      try {
        if (readable)
          skill = readSkill(
            path,
            root.providers.some((agent) => agent !== 'claude'),
          );
      } catch {
        invalidReason = 'SKILL.md has invalid metadata';
      }
      if (readable && !skill) invalidReason = 'SKILL.md has invalid metadata';
      if (!readable) invalidReason = 'SKILL.md is not a readable file';
      // A linked folder is the user's own (Mesa's library links were skipped above), so an edit
      // lands where the link points; a linked SKILL.md alone stays read-only.
      const writable = root.scope !== 'plugin' && !linkedFile && readable;
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
              readOnlyReason: !readable
                ? 'SKILL.md is not a readable file'
                : root.scope === 'plugin'
                  ? 'Managed by a provider plugin'
                  : 'Linked SKILL.md',
            }
          : {}),
        conflicts: [],
        disabledFor: root.disabled ? [...root.providers] : [],
        precedence: 'only-discovered-source',
      };
      seen.set(canonical, row);
      rows.push(row);
    }
  }
  for (const row of rows) {
    const skillFile = join(row.path, 'SKILL.md');
    if (
      row.providers.includes('claude') &&
      skillOverrides[row.name] === 'off' &&
      !row.disabledFor.includes('claude')
    ) {
      row.disabledFor.push('claude');
    }
    if (
      row.providers.includes('codex') &&
      existsSync(skillFile) &&
      disabled.has(realpathSync.native(skillFile))
    ) {
      row.disabledFor.push('codex');
    }
    if (row.source !== 'mesa' && row.disabledFor.length === row.providers.length) {
      row.enabled = false;
    }
    row.conflicts = rows
      .filter(
        (other) =>
          other !== row &&
          other.name === row.name &&
          other.providers.some((agent) => row.providers.includes(agent)) &&
          other.path !== row.path,
      )
      .map((other) => other.path);
    if (row.conflicts.length) row.precedence = 'provider-native';
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}
