import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { fixedClock, tempDir, thrown } from '../testing/index.js';
import { readNote, writeNote } from './notes.js';
import { outOfScope, vaultFile } from './scope.js';
import { initVault } from './vault.js';

let vault: string;
let outside: string;
beforeEach(() => {
  vault = join(tempDir(), 'vault');
  initVault({ path: vault, clock: fixedClock() });
  outside = tempDir();
  writeFileSync(join(outside, 'harbour.md'), '---\nproject: elsewhere\n---\nNot the vault.\n');
});

test('a vault-relative path in the vault resolves, written yet or not', () => {
  writeFileSync(join(vault, 'wiki/tide.md'), '# Tide\n');
  expect(vaultFile(vault, 'wiki/tide.md')).toBe(join(vault, 'wiki/tide.md'));
  expect(vaultFile(vault, 'wiki/new/folder/note.md')).toBe(join(vault, 'wiki/new/folder/note.md'));
  expect(vaultFile(vault, 'wiki/./tide.md')).toBe(join(vault, 'wiki/tide.md'));
  expect(outOfScope(vault, '..hidden.md')).toBeUndefined(); // a name that starts with dots
});

test('.., absolute paths, and the vault itself are outside the vault, even when they land inside', () => {
  for (const path of ['../escape.md', 'wiki/../index.md', '/etc/hosts', join(vault, 'index.md')]) {
    expect([path, outOfScope(vault, path)]).toEqual([path, 'outside the vault']);
  }
  expect(outOfScope(vault, '')).toBe('outside the vault');
  expect(outOfScope(vault, '.')).toBe('outside the vault');
  expect(thrown(() => vaultFile(vault, 'wiki/../index.md'))).toEqual({
    code: 'usage',
    message: 'vault path wiki/../index.md is outside the vault',
  });
});

test('internals are refused in any folder and any case', () => {
  for (const path of [
    '.obsidian/app.json',
    '.mesa/lock',
    '.trash/old.md',
    '.git/config',
    '.DS_Store',
    'wiki/.DS_Store',
    'projects/tide/.git/HEAD',
    '.Obsidian/workspace.json',
  ]) {
    expect([path, outOfScope(vault, path)]).toEqual([path, 'a vault internal']);
  }
  expect(outOfScope(vault, 'wiki/.obsidian-notes.md')).toBeUndefined();
});

test('a symlinked file or folder whose target leaves the vault is refused, for reads and writes', () => {
  symlinkSync(join(outside, 'harbour.md'), join(vault, 'wiki/harbour.md'));
  symlinkSync(outside, join(vault, 'projects/elsewhere'));
  expect(outOfScope(vault, 'wiki/harbour.md')).toBe('outside the vault');
  expect(outOfScope(vault, 'projects/elsewhere')).toBe('outside the vault');
  expect(outOfScope(vault, 'projects/elsewhere/harbour.md')).toBe('outside the vault');
  expect(outOfScope(vault, 'projects/elsewhere/not-yet.md')).toBe('outside the vault');
  expect(thrown(() => readNote(vault, 'wiki/harbour.md')).code).toBe('usage');
  expect(
    thrown(() =>
      writeNote(
        { vault, clock: fixedClock() },
        { path: 'wiki/harbour.md', frontmatter: {}, body: '' },
      ),
    ).code,
  ).toBe('usage');
});

test('a link whose target is missing is refused; a link to an internal is an internal', () => {
  symlinkSync(join(outside, 'gone.md'), join(vault, 'wiki/gone.md'));
  symlinkSync(join(outside, 'gone'), join(vault, 'wiki/gone-folder'));
  expect(outOfScope(vault, 'wiki/gone.md')).toBe('a broken link');
  expect(outOfScope(vault, 'wiki/gone-folder/note.md')).toBe('a broken link');
  mkdirSync(join(vault, '.obsidian'));
  symlinkSync(join(vault, '.obsidian'), join(vault, 'wiki/settings'));
  expect(outOfScope(vault, 'wiki/settings/app.json')).toBe('a vault internal');
});

test('a symlink that stays in the vault is in scope', () => {
  writeFileSync(join(vault, 'projects/tide.md'), '# Tide\n');
  symlinkSync(join(vault, 'projects/tide.md'), join(vault, 'wiki/tide.md'));
  symlinkSync(join(vault, 'projects'), join(vault, 'wiki/hubs'));
  expect(outOfScope(vault, 'wiki/tide.md')).toBeUndefined();
  expect(outOfScope(vault, 'wiki/hubs/tide.md')).toBeUndefined();
  expect(readNote(vault, 'wiki/hubs/tide.md').body).toBe('# Tide\n');
});
