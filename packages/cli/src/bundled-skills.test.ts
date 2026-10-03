import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, test } from 'vitest';
import { unpackSkills } from './bundled-skills.js';

const root = mkdtempSync(join(tmpdir(), 'mesa-bundled-skills-'));
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** An executable's assets, as node:sea's getAssetKeys and getAsset give them. */
const assets = (files: Record<string, string>) => ({
  keys: () => Object.keys(files),
  get: (key: string) => new TextEncoder().encode(files[key]).buffer as ArrayBuffer,
});

test('unpacks the skills/ assets once per version, replacing the old library whole', () => {
  const dir = join(root, '.mesa', '.skills');
  const v1 = assets({
    version: '0.1.0',
    'skills/mesa/SKILL.md': 'one',
    'skills/gone/SKILL.md': 'old',
  });
  expect(unpackSkills(dir, '0.1.0', v1)).toBe(dir);
  expect(readFileSync(join(dir, 'mesa/SKILL.md'), 'utf8')).toBe('one');
  expect(existsSync(join(dir, 'version'))).toBe(false);

  // The same version is not rewritten, so a run costs one read.
  const unused = { keys: () => [], get: () => new ArrayBuffer(0) };
  expect(unpackSkills(dir, '0.1.0', unused)).toBe(dir);
  expect(readFileSync(join(dir, 'mesa/SKILL.md'), 'utf8')).toBe('one');

  unpackSkills(dir, '0.2.0', assets({ 'skills/mesa/SKILL.md': 'two' }));
  expect(readFileSync(join(dir, 'mesa/SKILL.md'), 'utf8')).toBe('two');
  expect(existsSync(join(dir, 'gone'))).toBe(false);
});

test('mesa processes started together after an update all get the new library', async () => {
  // At the first launch after an update the app starts several mesa at once, each finding the
  // old version: none may fail while another replaces the folder.
  const dir = join(root, '.mesa', '.skills');
  unpackSkills(dir, '0.1.0', assets({ 'skills/mesa/SKILL.md': 'one' }));
  const module = new URL('./bundled-skills.ts', import.meta.url).href;
  const script = `
    import { unpackSkills } from ${JSON.stringify(module)};
    const files = {};
    for (let i = 0; i < 200; i++) files['skills/s' + i + '/SKILL.md'] = 'two';
    unpackSkills(${JSON.stringify(dir)}, '0.2.0', {
      keys: () => Object.keys(files),
      get: (key) => new TextEncoder().encode(files[key]).buffer,
    });`;
  const runs = Array.from({ length: 8 }, () =>
    promisify(execFile)(process.execPath, ['--input-type=module', '-e', script]),
  );
  await Promise.all(runs);
  expect(readFileSync(join(dir, '.version'), 'utf8')).toBe('0.2.0');
  expect(readFileSync(join(dir, 's199/SKILL.md'), 'utf8')).toBe('two');
});
