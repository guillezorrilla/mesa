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
  expect(setConfigValue(file, 'defaultAgent', 'codex')).toBe('codex');
  expect(setConfigValue(file, 'decisions.threshold', '0.5')).toBe(0.5);
  expect(setConfigValue(file, 'keys.jev', 'sk-secret')).toBe('***');

  const text = readFileSync(file, 'utf8');
  expect(text).toContain('# my note');
  expect(text).toContain('Mesa profile config');
  expect(text).toContain('keys:\n  jev: sk-secret\n');
  expect(loadConfig(file)).toMatchObject({
    vault: '/tmp/v',
    defaultAgent: 'codex',
    decisions: { backend: 'adapter', threshold: 0.5 },
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
});

test('a YAML syntax error reports the position, never the source text', () => {
  writeFileSync(file, 'vault: /tmp/v\nkeys:\n  jev: "sk-secret\n');
  const { code, message } = thrown(() => loadConfig(file));
  expect(code).toBe('invalid_config');
  expect(message).toMatch(/not valid YAML at line \d+/);
  expect(message).not.toContain('sk-secret');
});

test('env key references resolve from the injected environment', () => {
  setConfigValue(file, 'keys.jev', 'env:JEV_KEY');
  setConfigValue(file, 'keys.plain', 'literal');
  const config = loadConfig(file);
  expect(resolveKey(config, 'jev', { JEV_KEY: 'from-env' })).toBe('from-env');
  expect(resolveKey(config, 'jev', {})).toBeUndefined();
  expect(resolveKey(config, 'plain', {})).toBe('literal');
  expect(resolveKey(config, 'missing', {})).toBeUndefined();
});
