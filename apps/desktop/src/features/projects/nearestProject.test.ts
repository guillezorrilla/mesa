import type { ProjectRow } from '@mesa/core';
import { expect, test } from 'vitest';
import { nearestProject } from './nearestProject';

const listed = ['a', 'b', 'c'].map((name) => ({ name }) as ProjectRow);
const nearest = (list: readonly ProjectRow[], name: string) => nearestProject(list, name)?.name;

test('the project below, else above, else the first when unlisted, else none', () => {
  expect(nearest(listed, 'b')).toBe('c');
  expect(nearest(listed, 'c')).toBe('b');
  expect(nearest(listed, 'hidden')).toBe('a');
  expect(nearest(listed.slice(0, 1), 'a')).toBeUndefined();
});
