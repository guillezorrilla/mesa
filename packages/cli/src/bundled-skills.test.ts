import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
