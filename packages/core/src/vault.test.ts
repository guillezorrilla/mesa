import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { fixedClock, tempDir, thrown } from './testing.js';
import { initVault as init, VAULT_LAYOUT, vaultStatus } from './vault.js';

let vault: string;
beforeEach(() => {
  vault = join(tempDir(), 'vault');
});

const clock = fixedClock('2026-09-24T12:00:00.000Z');
const initVault = (opts: { path: string; force?: boolean }) => init({ ...opts, clock });

/** Every path under `dir`, the root included, with its mtime and, for files, its contents. */
function snapshot(dir: string) {
  const paths = ['', ...readdirSync(dir, { recursive: true, encoding: 'utf8' })].sort();
  return paths.map((p) => {
    const stat = statSync(join(dir, p));
    const text = stat.isFile() ? readFileSync(join(dir, p), 'utf8') : null;
    return { p, mtime: stat.mtimeMs, text };
  });
}

const errorCode = (fn: () => unknown) => thrown(fn).code;

const template = readFileSync(new URL('../templates/vault-AGENTS.md', import.meta.url), 'utf8');

test('fresh: creates every folder and file, AGENTS.md from the template, log.md first line', () => {
  expect(initVault({ path: vault }).created.sort()).toEqual([...VAULT_LAYOUT].sort());
  for (const dir of ['raw', 'wiki', 'projects', 'receipts', 'daily']) {
    expect(statSync(join(vault, dir)).isDirectory()).toBe(true);
  }
  expect(readFileSync(join(vault, 'AGENTS.md'), 'utf8')).toBe(template);
  expect(readFileSync(join(vault, 'index.md'), 'utf8')).toMatch(/^# Index\n/);
  expect(readFileSync(join(vault, 'log.md'), 'utf8')).toBe(
    '- 2026-09-24T12:00:00.000Z vault initialised by mesa\n',
  );
  expect(readdirSync(vault)).not.toContain('.obsidian');
  expect(vaultStatus(vault)).toEqual({ path: vault, ok: true, missing: [] });
});

test('idempotent: a second run on a complete vault changes no file, contents or mtimes', () => {
  initVault({ path: vault });
  const before = snapshot(vault);
  expect(initVault({ path: vault })).toEqual({ path: vault, created: [] });
  expect(initVault({ path: vault, force: true }).created).toEqual([]);
  expect(snapshot(vault)).toEqual(before);
});

test('missing folder: status lists it and init creates only it, keeping edited files', () => {
  initVault({ path: vault });
  rmSync(join(vault, 'receipts'), { recursive: true });
  writeFileSync(join(vault, 'index.md'), '# My index\n');
  const kept = snapshot(join(vault, 'wiki'));

  expect(vaultStatus(vault)).toEqual({ path: vault, ok: false, missing: ['receipts'] });
  expect(initVault({ path: vault }).created).toEqual(['receipts']);
  expect(readFileSync(join(vault, 'index.md'), 'utf8')).toBe('# My index\n');
  expect(snapshot(join(vault, 'wiki'))).toEqual(kept);
  expect(vaultStatus(vault).ok).toBe(true);
  expect(vaultStatus(join(vault, 'nope')).missing).toEqual(VAULT_LAYOUT);
});

test('refuse: a non-empty folder that is not a vault is invalid_config and left untouched', () => {
  mkdirSync(vault);
  writeFileSync(join(vault, 'AGENTS.md'), 'a repo, not a vault\n');
  writeFileSync(join(vault, 'log.md'), 'my own log\n');
  const before = snapshot(vault);
  expect(errorCode(() => initVault({ path: vault }))).toBe('invalid_config');
  expect(snapshot(vault)).toEqual(before);

  const file = join(vault, 'AGENTS.md');
  expect(errorCode(() => initVault({ path: file, force: true }))).toBe('invalid_config');
  writeFileSync(join(vault, 'raw'), 'a file where a folder goes\n');
  expect(errorCode(() => initVault({ path: vault, force: true }))).toBe('invalid_config');
});

test('an empty folder, or one holding only .DS_Store or .mesa/, needs no --force', () => {
  mkdirSync(join(vault, '.mesa'), { recursive: true });
  writeFileSync(join(vault, '.DS_Store'), '');
  expect(initVault({ path: vault }).created).toHaveLength(VAULT_LAYOUT.length);
});

test('force: lays out a non-empty folder and never overwrites an existing file', () => {
  mkdirSync(vault);
  writeFileSync(join(vault, 'AGENTS.md'), 'a repo, not a vault\n');
  writeFileSync(join(vault, 'notes.md'), 'mine\n');
  const created = initVault({ path: vault, force: true }).created;
  expect(created).not.toContain('AGENTS.md');
  expect(created).toHaveLength(VAULT_LAYOUT.length - 1);
  expect(readFileSync(join(vault, 'AGENTS.md'), 'utf8')).toBe('a repo, not a vault\n');
  expect(readFileSync(join(vault, 'notes.md'), 'utf8')).toBe('mine\n');
  // Its log.md now marks it as a vault, so a later run needs no --force.
  rmSync(join(vault, 'daily'), { recursive: true });
  expect(initVault({ path: vault }).created).toEqual(['daily']);
});

test('an Obsidian vault is laid out without --force and .obsidian/ is untouched', () => {
  mkdirSync(join(vault, '.obsidian'), { recursive: true });
  writeFileSync(join(vault, '.obsidian', 'app.json'), '{}\n');
  writeFileSync(join(vault, 'Welcome.md'), 'hello\n');
  const obsidian = snapshot(join(vault, '.obsidian'));
  expect(initVault({ path: vault }).created).toHaveLength(VAULT_LAYOUT.length);
  expect(snapshot(join(vault, '.obsidian'))).toEqual(obsidian);
  expect(readFileSync(join(vault, 'Welcome.md'), 'utf8')).toBe('hello\n');
});
