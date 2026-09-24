import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import {
  configPath,
  initProfile,
  loadConfig,
  redactConfig,
  resolveKey,
  setConfigValue,
} from './config.js';
import { profileDir } from './index.js';
import { MesaError } from './result.js';

let home: string;
let dir: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'mesa-home-'));
  dir = profileDir('default', home);
});

test('init creates the profile dir, a 0600 config with defaults, and sessions/', () => {
  expect(initProfile({ dir, vault: '/tmp/v' })).toEqual({ created: true, path: configPath(dir) });
  expect(statSync(configPath(dir)).mode & 0o777).toBe(0o600);
  expect(statSync(join(dir, 'sessions')).isDirectory()).toBe(true);
  expect(loadConfig(dir)).toEqual({
    vault: '/tmp/v',
    defaultAgent: 'claude',
    skills: [],
    decisions: { backend: 'adapter', threshold: 0.7 },
    sessions: { log: true },
    keys: {},
  });
});

test('init is idempotent and profiles are independent', () => {
  initProfile({ dir, vault: '/tmp/v' });
  const before = readFileSync(configPath(dir), 'utf8');
  expect(initProfile({ dir, vault: '/tmp/other', agent: 'codex' }).created).toBe(false);
  expect(readFileSync(configPath(dir), 'utf8')).toBe(before);

  const work = profileDir('work', home);
  initProfile({ dir: work, vault: '/tmp/w', agent: 'codex' });
  expect(loadConfig(work)).toMatchObject({ vault: '/tmp/w', defaultAgent: 'codex' });
  expect(loadConfig(dir)).toMatchObject({ vault: '/tmp/v', defaultAgent: 'claude' });
});

test('set rewrites one field, keeps the others and comments, and redacts keys', () => {
  initProfile({ dir, vault: '/tmp/v' });
  writeFileSync(configPath(dir), `${readFileSync(configPath(dir), 'utf8')}# my note\n`);

  expect(setConfigValue(dir, 'defaultAgent', 'codex')).toBe('codex');
  expect(setConfigValue(dir, 'decisions.threshold', '0.5')).toBe(0.5);
  expect(setConfigValue(dir, 'keys.jev', 'sk-secret')).toBe('***');
  const text = readFileSync(configPath(dir), 'utf8');
  expect(text).toContain('# my note');
  expect(text).toContain('keys:\n  jev: sk-secret\n');
  expect(text).toContain('Mesa profile config');
  expect(loadConfig(dir)).toMatchObject({
    vault: '/tmp/v',
    defaultAgent: 'codex',
    decisions: { backend: 'adapter', threshold: 0.5 },
  });
  expect(redactConfig(loadConfig(dir)).keys).toEqual({ jev: '***' });
});

test('an invalid file or value is invalid_config with the failing field path', () => {
  initProfile({ dir, vault: '/tmp/v' });
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return e instanceof MesaError ? [e.code, e.message] : e;
    }
  };
  const before = readFileSync(configPath(dir), 'utf8');
  expect(code(() => setConfigValue(dir, 'decisions.threshold', '2'))?.[0]).toBe('invalid_config');
  expect(code(() => setConfigValue(dir, 'defaultAgnet', 'codex'))?.[0]).toBe('invalid_config');
  expect(readFileSync(configPath(dir), 'utf8')).toBe(before);

  writeFileSync(configPath(dir), 'vault: relative/path\ndecisions:\n  threshold: 3\n');
  const [c, message] = code(() => loadConfig(dir)) as [string, string];
  expect(c).toBe('invalid_config');
  expect(message).toContain('vault: must be an absolute path');

  writeFileSync(configPath(dir), 'vault: /tmp/v\nkeys:\n  jev: "sk-secret\n');
  const [parseCode, parseMessage] = code(() => loadConfig(dir)) as [string, string];
  expect(parseCode).toBe('invalid_config');
  expect(parseMessage).toMatch(/not valid YAML at line \d+/);
  expect(parseMessage).not.toContain('sk-secret');
  expect(code(() => initProfile({ dir: profileDir('x', home), vault: 'rel' }))?.[0]).toBe(
    'invalid_config',
  );
  expect(code(() => loadConfig(profileDir('none', home)))?.[0]).toBe('not_found');
});

test('env key references resolve from the environment', () => {
  initProfile({ dir, vault: '/tmp/v' });
  setConfigValue(dir, 'keys.jev', 'env:JEV_KEY');
  setConfigValue(dir, 'keys.plain', 'literal');
  const config = loadConfig(dir);
  expect(resolveKey(config, 'jev', { JEV_KEY: 'from-env' })).toBe('from-env');
  expect(resolveKey(config, 'jev', {})).toBeUndefined();
  expect(resolveKey(config, 'plain', {})).toBe('literal');
  expect(resolveKey(config, 'missing', {})).toBeUndefined();
});
