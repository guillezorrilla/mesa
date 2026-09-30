import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';
import { isolateTmp, tempDir } from './tmp.js';

test('isolateTmp gives the file its own TMPDIR and removes it, fixtures and all, when the file ends', () => {
  const shared = tmpdir();
  let end = () => {};
  isolateTmp({ afterAll: (fn) => (end = fn) });
  const own = tmpdir();
  expect(dirname(own)).toBe(shared);
  writeFileSync(join(tempDir(), 'note.md'), '# invented');

  end();

  expect(existsSync(own)).toBe(false);
  expect(tmpdir()).toBe(shared);
});
