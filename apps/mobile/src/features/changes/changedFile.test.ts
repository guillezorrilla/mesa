import { expect, test } from 'vitest';
import { changedFileLabel, viewedToggleLabel } from './changedFileLabel';
import { viewedKey } from './viewedKey';

const file = { path: 'src/tide.ts', added: 2, removed: 1, rev: 'a1b2' };

test("a changed file's row reads its counts, and its viewed mark lasts until its patch changes", () => {
  expect(changedFileLabel(file, true)).toBe('src/tide.ts, 2 added, 1 removed, viewed');
  expect(changedFileLabel(file, false)).toBe('src/tide.ts, 2 added, 1 removed');
  expect(viewedToggleLabel('a.ts', true)).toBe('Mark a.ts not viewed');
  expect(viewedKey(file)).not.toBe(viewedKey({ ...file, rev: 'c3d4' }));
});
