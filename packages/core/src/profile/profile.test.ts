import { readFileSync, statSync } from 'node:fs';
import { expect, test } from 'vitest';
import { tempDir, thrown } from '../testing/index.js';
import { loadConfig } from './config.js';
import { profilePaths } from './paths.js';
import { initProfile, openProfile, resolveProfileName } from './profile.js';

test('the flag wins over MESA_PROFILE, which wins over default', () => {
  expect(resolveProfileName('personal', { MESA_PROFILE: 'work' })).toBe('personal');
  expect(resolveProfileName(undefined, { MESA_PROFILE: 'work' })).toBe('work');
  expect(resolveProfileName(undefined, {})).toBe('default');
});

test('profile paths live under <home>/.mesa/<profile>', () => {
  expect(profilePaths('/h', 'work')).toEqual({
    root: '/h/.mesa/work',
    config: '/h/.mesa/work/config.yaml',
    registry: '/h/.mesa/work/registry.yaml',
    sessions: '/h/.mesa/work/sessions',
    events: '/h/.mesa/work/sessions/events',
    attachScripts: '/h/.mesa/work/attach',
    worktrees: '/h/.mesa/work/worktrees',
    tmuxSocket: 'mesa-work',
  });
});

test('init creates a 0700 dir, sessions/, and a 0600 config with defaults', () => {
  const paths = profilePaths(tempDir(), 'default');
  expect(initProfile(paths, { vault: '/tmp/v' })).toEqual({ created: true, path: paths.config });
  expect(statSync(paths.root).mode & 0o777).toBe(0o700);
  expect(statSync(paths.sessions).isDirectory()).toBe(true);
  expect(statSync(paths.config).mode & 0o777).toBe(0o600);
  expect(readFileSync(paths.config, 'utf8')).toMatch(/^# Mesa profile config/);
  expect(loadConfig(paths.config)).toEqual({
    vault: '/tmp/v',
    defaultAgent: 'claude',
    skills: ['mesa'],
    decisions: { backend: 'adapter', threshold: 0.7 },
    sessions: { log: true },
    terminal: { app: 'Terminal' },
    keys: {},
  });
});

test('init is idempotent, profiles are independent, and invalid input leaves nothing', () => {
  const home = tempDir();
  const main = profilePaths(home, 'default');
  initProfile(main, { vault: '/tmp/v' });
  const before = readFileSync(main.config, 'utf8');
  expect(initProfile(main, { vault: '/tmp/other', agent: 'codex' }).created).toBe(false);
  expect(readFileSync(main.config, 'utf8')).toBe(before);

  const work = profilePaths(home, 'work');
  initProfile(work, { vault: '/tmp/w', agent: 'codex' });
  expect(openProfile(work).config).toMatchObject({
    vault: '/tmp/w',
    defaultAgent: 'codex',
  });

  const bad = profilePaths(home, 'bad');
  expect(thrown(() => initProfile(bad, { vault: 'relative' })).code).toBe('invalid_config');
  expect(() => statSync(bad.root)).toThrow();
});

test('opening an uninitialised profile is not_found with the init hint', () => {
  const { code, message } = thrown(() => openProfile(profilePaths(tempDir(), 'none')));
  expect(code).toBe('not_found');
  expect(message).toContain('run mesa init');
});
