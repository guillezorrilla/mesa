import { readFileSync, writeFileSync } from 'node:fs';
import { beforeEach, expect, test } from 'vitest';
import { tempDir, thrown } from '../testing/index.js';
import { loadConfig, redactConfig, resolveKey, setConfigValue } from './config.js';
import { profilePaths } from './paths.js';
import { initProfile } from './profile.js';

let file: string;
beforeEach(() => {
  const paths = profilePaths(tempDir(), 'default');
  initProfile(paths, { vault: '/tmp/v' });
  file = paths.config;
});

test('set rewrites one field, keeps the others and every comment, and redacts keys', () => {
  writeFileSync(file, `${readFileSync(file, 'utf8')}# my note\n`);
  expect(setConfigValue(file, 'defaultAgent', 'codex')).toEqual({ value: 'codex', changed: true });
  expect(setConfigValue(file, 'decisions.threshold', '0.5').value).toBe(0.5);
  expect(setConfigValue(file, 'keys.jev', 'sk-secret').value).toBe('***');
  // The same value again, or a default written out, changes nothing.
  expect(setConfigValue(file, 'keys.jev', 'sk-secret').changed).toBe(false);
  expect(setConfigValue(file, 'terminal.app', 'Terminal').changed).toBe(false);

  const text = readFileSync(file, 'utf8');
  expect(text).toContain('# my note');
  expect(text).toContain('Mesa profile config');
  expect(text).toContain('keys:\n  jev: sk-secret\n');
  expect(loadConfig(file)).toMatchObject({
    vault: '/tmp/v',
    defaultAgent: 'codex',
    decisions: { backend: 'rules', threshold: 0.5 },
  });
  expect(redactConfig(loadConfig(file)).keys).toEqual({ jev: '***' });
});

test('an invalid value or file is invalid_config with the failing field, and the file is kept', () => {
  const before = readFileSync(file, 'utf8');
  expect(thrown(() => setConfigValue(file, 'decisions.threshold', '2')).code).toBe(
    'invalid_config',
  );
  expect(thrown(() => setConfigValue(file, 'defaultAgnet', 'codex')).code).toBe('invalid_config');
  expect(readFileSync(file, 'utf8')).toBe(before);

  writeFileSync(file, 'vault: relative/path\ndecisions:\n  threshold: 3\n');
  expect(thrown(() => loadConfig(file))).toEqual({
    code: 'invalid_config',
    message: `${file}: vault: must be an absolute path`,
  });

  // Jev was dropped (ADR-0004): naming it is an error with the field and the backends it takes.
  writeFileSync(file, 'vault: /tmp/v\ndecisions:\n  backend: jev\n');
  expect(thrown(() => loadConfig(file))).toEqual({
    code: 'invalid_config',
    message: `${file}: decisions.backend: Invalid input: expected "rules"`,
  });
});

test('a config that still names the removed adapter loads, and acts as rules', () => {
  writeFileSync(file, 'vault: /tmp/v\ndecisions:\n  backend: adapter\n  adapter: codex\n');
  expect(loadConfig(file).decisions).toEqual({ backend: 'rules', threshold: 0.7 });
  writeFileSync(file, 'vault: /tmp/v\ndecisions:\n  adapter: claude\n  threshold: 0.5\n');
  expect(loadConfig(file).decisions).toEqual({ backend: 'rules', threshold: 0.5 });
  // Any other unknown field is still an error.
  writeFileSync(file, 'vault: /tmp/v\ndecisions:\n  model: haiku\n');
  expect(thrown(() => loadConfig(file)).code).toBe('invalid_config');
});

test('a config that still holds the removed board settings loads, and ignores them', () => {
  writeFileSync(
    file,
    'vault: /tmp/v\nboard:\n  view: cards\n  sort: manual\n  order: [aaaaaaaa]\n',
  );
  const config = loadConfig(file);
  expect(config.vault).toBe('/tmp/v');
  expect(config).not.toHaveProperty('board');
  expect(setConfigValue(file, 'projects.sort', 'recent').value).toBe('recent');
  const before = readFileSync(file, 'utf8');
  expect(thrown(() => setConfigValue(file, 'board.view', 'list')).code).toBe('invalid_config');
  expect(readFileSync(file, 'utf8')).toBe(before);
});

test('usage alert thresholds default off and reject negative budgets', () => {
  expect(loadConfig(file).usage).toEqual({
    dailyAlertUsd: 0,
    weeklyAlertUsd: 0,
    monthlyAlertUsd: 0,
  });
  expect(setConfigValue(file, 'usage.dailyAlertUsd', '2.5').value).toBe(2.5);
  const before = readFileSync(file, 'utf8');
  expect(thrown(() => setConfigValue(file, 'usage.weeklyAlertUsd', '-1')).code).toBe(
    'invalid_config',
  );
  expect(readFileSync(file, 'utf8')).toBe(before);
});

test('editor preferences and external argv validate before saving', () => {
  expect(setConfigValue(file, 'editor.vim', 'true').value).toBe(true);
  expect(setConfigValue(file, 'editor.tabSize', '4').value).toBe(4);
  expect(
    setConfigValue(file, 'editor.external', '["/usr/bin/open", "-a", "TextEdit", "{file}"]').value,
  ).toEqual(['/usr/bin/open', '-a', 'TextEdit', '{file}']);
  const before = readFileSync(file, 'utf8');
  for (const value of [
    '["sh", "-c", "{file}"]',
    '["/bin/sh", "-c", "{file}{file}"]',
    '["/bin/sh", "-c"]',
  ] as const) {
    expect(thrown(() => setConfigValue(file, 'editor.external', value)).code).toBe(
      'invalid_config',
    );
    expect(readFileSync(file, 'utf8')).toBe(before);
  }
});

test('appearance and terminal preferences validate in the profile config', () => {
  expect(loadConfig(file)).toMatchObject({
    appearance: {
      theme: 'system',
      fontSize: 16,
      diffFontSize: 13,
      fileTreeFontSize: 14,
      colorVision: 'normal',
    },
    terminal: { app: 'Terminal', theme: 'follow', fontSize: 13, scrollSpeed: 3 },
  });
  expect(setConfigValue(file, 'appearance.theme', 'dark').value).toBe('dark');
  expect(setConfigValue(file, 'appearance.colorVision', 'red-green').value).toBe('red-green');
  expect(setConfigValue(file, 'terminal.optionAsMeta', 'true').value).toBe(true);
  for (const path of ['appearance.diffFontSize', 'appearance.fileTreeFontSize'])
    for (const size of [10, 20]) expect(setConfigValue(file, path, String(size)).value).toBe(size);
  const before = readFileSync(file, 'utf8');
  for (const [path, value] of [
    ['appearance.fontSize', '7'],
    ['appearance.diffFontSize', '9'],
    ['appearance.diffFontSize', '21'],
    ['appearance.diffFontSize', '13.5'],
    ['appearance.fileTreeFontSize', '9'],
    ['appearance.fileTreeFontSize', '21'],
    ['appearance.colorVision', 'unknown'],
    ['terminal.scrollSpeed', '21'],
    ['terminal.fontFamily', '""'],
  ] as const) {
    expect(thrown(() => setConfigValue(file, path, value)).code).toBe('invalid_config');
    expect(readFileSync(file, 'utf8')).toBe(before);
  }
});

test('worktree settings retain the profile default and reject unsafe directories', () => {
  expect(loadConfig(file).worktrees).toEqual({
    location: 'profile',
    fetch: false,
    sparseDirectories: [],
    carryIgnoredDirectories: [],
    setup: [],
    teardown: [],
    deleteBranch: false,
  });
  expect(setConfigValue(file, 'worktrees.location', 'nested').value).toBe('nested');
  expect(setConfigValue(file, 'worktrees.deleteBranch', 'true').value).toBe(true);
  expect(loadConfig(file).worktrees.deleteBranch).toBe(true);
  expect(setConfigValue(file, 'worktrees.sparseDirectories', '[src, docs]').value).toEqual([
    'src',
    'docs',
  ]);
  const before = readFileSync(file, 'utf8');
  for (const [path, value] of [
    ['worktrees.location', 'custom'],
    ['worktrees.sparseDirectories', '["../outside"]'],
    ['worktrees.carryIgnoredDirectories', '[".git/objects"]'],
    ['worktrees.deleteBranch', 'sometimes'],
  ] as const) {
    expect(thrown(() => setConfigValue(file, path, value)).code).toBe('invalid_config');
    expect(readFileSync(file, 'utf8')).toBe(before);
  }
});

test('a YAML syntax error reports the position, never the source text', () => {
  writeFileSync(file, 'vault: /tmp/v\nkeys:\n  jev: "sk-secret\n');
  const { code, message } = thrown(() => loadConfig(file));
  expect(code).toBe('invalid_config');
  expect(message).toMatch(/not valid YAML at line \d+/);
  expect(message).not.toContain('sk-secret');
});

test('env key references resolve from the injected environment', () => {
  setConfigValue(file, 'keys.maps', 'env:MAPS_KEY');
  setConfigValue(file, 'keys.plain', 'literal');
  const config = loadConfig(file);
  expect(resolveKey(config, 'maps', { MAPS_KEY: 'from-env' })).toBe('from-env');
  expect(resolveKey(config, 'maps', {})).toBeUndefined();
  expect(resolveKey(config, 'plain', {})).toBe('literal');
  expect(resolveKey(config, 'missing', {})).toBeUndefined();
});

test('a set repairs a value the file holds by hand that does not validate', () => {
  writeFileSync(file, readFileSync(file, 'utf8').replace('threshold: 0.7', 'threshold: 3'));
  expect(thrown(() => loadConfig(file)).code).toBe('invalid_config');
  expect(setConfigValue(file, 'decisions.threshold', '0.5')).toEqual({ value: 0.5, changed: true });
  expect(loadConfig(file).decisions.threshold).toBe(0.5);
});

test('shortcut values are canonical, unique, and never take reserved window keys', () => {
  expect(loadConfig(file).shortcuts).toEqual({
    search: 'Mod+K',
    board: 'Mod+1',
    newSession: 'Mod+N',
  });
  expect(setConfigValue(file, 'shortcuts.search', 'Mod+Shift+P').value).toBe('Mod+Shift+P');
  for (const value of ['Mod+Q', 'Mod+1', 'K', 'Mod+shift+P']) {
    expect(thrown(() => setConfigValue(file, 'shortcuts.search', value)).code).toBe(
      'invalid_config',
    );
  }
  expect(loadConfig(file).shortcuts.search).toBe('Mod+Shift+P');
});

test('agent launch defaults are unset by default, validate in each agent terms, and unset again', () => {
  expect(loadConfig(file).agents).toEqual({ claude: {}, codex: {}, antigravity: {} });
  expect(setConfigValue(file, 'agents.claude.skipPermissions', 'true').value).toBe(true);
  expect(setConfigValue(file, 'agents.codex.approvalPolicy', 'never').value).toBe('never');
  expect(setConfigValue(file, 'agents.codex.sandbox', 'workspace-write').value).toBe(
    'workspace-write',
  );
  expect(setConfigValue(file, 'agents.codex.bypass', 'false').value).toBe(false);
  expect(setConfigValue(file, 'agents.antigravity.skipPermissions', 'true').value).toBe(true);
  expect(setConfigValue(file, 'agents.antigravity.mode', 'accept-edits').value).toBe(
    'accept-edits',
  );
  expect(setConfigValue(file, 'agents.antigravity.sandbox', 'true').value).toBe(true);
  const before = readFileSync(file, 'utf8');
  for (const [path, value] of [
    ['agents.claude.skipPermissions', 'yes please'],
    ['agents.claude.mode', 'plan'],
    ['agents.codex.approvalPolicy', 'untrusted'],
    ['agents.codex.sandbox', 'full'],
    ['agents.antigravity.mode', 'acceptEdits'],
    ['agents.gemini', '{}'],
  ] as const) {
    expect(thrown(() => setConfigValue(file, path, value)).code).toBe('invalid_config');
    expect(readFileSync(file, 'utf8')).toBe(before);
  }
  // The app saves an agent's map whole, so a field it leaves out is back on native config.
  expect(setConfigValue(file, 'agents.codex', '{"sandbox": "read-only"}').value).toEqual({
    sandbox: 'read-only',
  });
  expect(loadConfig(file).agents.codex).toEqual({ sandbox: 'read-only' });
});
