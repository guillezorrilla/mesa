import { homedir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { profileDir, resolveProfile } from './index.js';

test('resolves profile precedence and its directory', () => {
  expect(resolveProfile({ flag: 'personal', env: { MESA_PROFILE: 'work' } })).toBe('personal');
  expect(resolveProfile({ env: { MESA_PROFILE: 'work' } })).toBe('work');
  expect(resolveProfile({ env: {} })).toBe('default');
  expect(resolveProfile({})).toBe('default');
  expect(profileDir('work', '/Users/test')).toBe('/Users/test/.mesa/work');
  expect(profileDir('default')).toBe(join(homedir(), '.mesa', 'default'));
});
