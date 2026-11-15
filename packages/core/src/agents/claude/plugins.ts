import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { claudeInstalledPlugins } from './paths.js';

export type InstalledPlugin = { name: string; installPath: string };

/**
 * The plugins Claude Code installed that apply to a project: user-scope ones, and project or
 * local ones installed for `projectDir`. `name` is the key in installed_plugins.json
 * (`plugin@marketplace`). A missing or unreadable file lists none.
 */
export function installedPlugins(claudeDir: string, projectDir?: string): InstalledPlugin[] {
  const file = claudeInstalledPlugins(claudeDir);
  if (!existsSync(file)) return [];
  let metadata: unknown;
  try {
    metadata = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
  const plugins =
    metadata && typeof metadata === 'object' && 'plugins' in metadata
      ? metadata.plugins
      : undefined;
  if (!plugins || typeof plugins !== 'object') return [];
  const found: InstalledPlugin[] = [];
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
        found.push({ name, installPath });
      }
    }
  }
  return found;
}
