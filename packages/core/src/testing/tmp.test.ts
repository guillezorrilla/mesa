import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';
import { isolateTmp } from './tmp.js';

test('isolateTmp gives the file its own TMPDIR and removes it, fixtures and all, when the file ends', () => {
  const env: Record<string, string | undefined> = { TMPDIR: tmpdir() };
  let end = () => {};
  isolateTmp({ afterAll: (fn) => (end = fn), env });
  const own = env.TMPDIR ?? '';
  expect(dirname(own)).toBe(tmpdir());
  writeFileSync(join(own, 'note.md'), '# invented');

  end();

  expect(existsSync(own)).toBe(false);
  expect(env.TMPDIR).toBe(tmpdir());
});
