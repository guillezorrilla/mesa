import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { z } from 'zod';
import { tempDir, thrown } from './testing.js';
import { readYaml, setYamlPath, writeYaml } from './yaml-file.js';

const Schema = z.strictObject({ n: z.number().max(5), tags: z.record(z.string(), z.string()) });

test('writeYaml adds a header, and exclusive never replaces a file', () => {
  const file = join(tempDir(), 'a.yaml');
  expect(writeYaml(file, { n: 1, tags: {} }, { header: 'Hello', exclusive: true })).toBe(true);
  expect(writeYaml(file, { n: 2, tags: {} }, { exclusive: true })).toBe(false);
  expect(readFileSync(file, 'utf8')).toBe('# Hello\n\nn: 1\ntags: {}\n');
  expect(readYaml(file, Schema)).toEqual({ n: 1, tags: {} });
});

test('setYamlPath keeps comments, blocks a grown flow map, and never writes an invalid result', () => {
  const file = join(tempDir(), 'b.yaml');
  writeFileSync(file, 'n: 1 # count\ntags: {}\n');
  expect(setYamlPath(file, Schema, 'tags.a', 'x')).toEqual({ n: 1, tags: { a: 'x' } });
  expect(readFileSync(file, 'utf8')).toBe('n: 1 # count\ntags:\n  a: x\n');

  expect(thrown(() => setYamlPath(file, Schema, 'n', 9)).code).toBe('invalid_config');
  expect(readYaml(file, Schema).n).toBe(1);
});
