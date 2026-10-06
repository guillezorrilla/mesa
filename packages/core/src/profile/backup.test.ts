import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { readRegistry, updateRegistry } from '../projects/registry.js';
import { lockDeps, profilePaths, tempDir, testDeps } from '../testing/index.js';

test('backup restores only portable profile data into a separate, new profile', () => {
  const home = tempDir();
  const source = createMesa('source', testDeps(home));
  source.init({ vault: join(home, 'source-vault') });
  source.config.set('keys.api', 'sk-invented-secret');
  source.config.set('appearance.theme', 'dark');
  updateRegistry(lockDeps(), profilePaths(home, 'source').registry, () => [
    { name: 'lantern', path: '/invented/lantern' },
  ]);
  source.prompts.save('Review', 'Line one\n\n  line three\n');
  const { path } = source.backup.create();
  const archive = readFileSync(path, 'utf8');
  expect(archive).not.toContain('sk-invented-secret');
  expect(archive).not.toContain(join(home, 'source-vault'));
  expect(JSON.parse(archive)).not.toHaveProperty('sessions');
  expect(JSON.parse(archive)).not.toHaveProperty('logs');

  const target = createMesa('restored', testDeps(home));
  const vault = join(home, 'new-vault');
  expect(target.backup.restore(path, vault)).toMatchObject({
    profile: 'restored',
    projects: 1,
    prompts: 1,
  });
  expect(target.config.get()).toMatchObject({ vault, keys: {}, appearance: { theme: 'dark' } });
  expect(readRegistry(profilePaths(home, 'restored').registry)).toEqual([
    { name: 'lantern', path: '/invented/lantern' },
  ]);
  expect(target.prompts.list()).toEqual([{ name: 'Review', text: 'Line one\n\n  line three\n' }]);
  expect(existsSync(vault)).toBe(false);
  expect(() => target.backup.restore(path, join(home, 'another-vault'))).toThrow('already exists');
});

test('invalid backup and existing vault leave a new destination untouched; retention keeps five', () => {
  const home = tempDir();
  const source = createMesa('source', testDeps(home));
  source.init({ vault: join(home, 'source-vault') });
  const target = createMesa('target', testDeps(home));
  const backup = source.backup.create().path;
  const invalid = join(home, 'invalid.json');
  writeFileSync(invalid, '{broken');
  expect(() => target.backup.restore(invalid, join(home, 'new-vault'))).toThrow('not valid JSON');
  expect(existsSync(profilePaths(home, 'target').root)).toBe(false);
  expect(() => target.backup.restore(join(home, 'missing.json'), join(home, 'new-vault'))).toThrow(
    'backup not found',
  );
  expect(() => target.backup.restore(backup, home)).toThrow('new vault path');
  expect(existsSync(profilePaths(home, 'target').root)).toBe(false);
  for (let n = 0; n < 6; n++) source.backup.create();
  expect(readdirSync(profilePaths(home, 'source').backups)).toHaveLength(5);
});
