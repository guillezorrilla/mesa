import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { shortTempDir } from '../../testing/index.js';
import { claudeConfigValues } from './config-values.js';

const write = (path: string, value: object) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
};

test("reads each /config key where Claude Code keeps it, the project's local settings winning", () => {
  const home = shortTempDir();
  const cwd = join(home, 'cove');
  write(join(home, '.claude.json'), { verbose: true, editorMode: 'vim', theme: 'dark' });
  write(join(home, '.claude/settings.json'), {
    outputStyle: 'Concise',
    permissions: { defaultMode: 'plan' },
  });
  write(join(cwd, '.claude/settings.local.json'), { outputStyle: 'Learning' });
  const keys = ['verbose', 'editor', 'theme', 'outputStyle', 'permissionMode', 'tips', 'buoy'];
  expect(claudeConfigValues(keys, cwd, {}, home)).toEqual({
    verbose: 'true',
    editor: 'vim',
    theme: 'dark',
    outputStyle: 'Learning',
    permissionMode: 'plan',
    tips: 'true',
  });
});

test('with CLAUDE_CONFIG_DIR set, its global config and settings are read, not the home ones', () => {
  const home = shortTempDir();
  const dir = join(home, 'config/claude');
  write(join(home, '.claude.json'), { verbose: true });
  write(join(dir, '.claude.json'), { verbose: false });
  write(join(dir, 'settings.json'), { awaySummaryEnabled: true });
  expect(claudeConfigValues(['verbose', 'recap'], home, { CLAUDE_CONFIG_DIR: dir }, home)).toEqual({
    verbose: 'false',
    recap: 'true',
  });
});

test('missing or unreadable files give the defaults alone', () => {
  const home = shortTempDir();
  writeFileSync(join(home, '.claude.json'), '{not json');
  expect(claudeConfigValues(['verbose', 'language'], home, {}, home)).toEqual({ verbose: 'false' });
});
