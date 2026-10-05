import { readFileSync, statSync } from 'node:fs';
import { expect, test } from 'vitest';
import { tempDir, thrown } from '../testing/index.js';
import { loadConfig, setConfigValue } from './config.js';
import { profilePaths } from './paths.js';
import { DEFAULT_APPEARANCE, DEFAULT_TERMINAL_PREFERENCES } from './preferences.js';
import { initProfile, openProfile, resolveProfileName } from './profile.js';
import { DEFAULT_SHORTCUTS } from './shortcuts.js';

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
    logs: '/h/.mesa/work/sessions/logs',
    runs: '/h/.mesa/work/sessions/runs',
    costs: '/h/.mesa/work/sessions/costs',
    usage: '/h/.mesa/work/usage.json',
    notifications: '/h/.mesa/work/notifications.json',
    prEvents: '/h/.mesa/work/pr-events.json',
    prompts: '/h/.mesa/work/prompts.json',
    automations: '/h/.mesa/work/automations.yaml',
    automationState: '/h/.mesa/work/automation-state.yaml',
    pendingImportNotes: '/h/.mesa/work/pending-import-notes.yaml',
    backups: '/h/.mesa/work/backups',
    attachScripts: '/h/.mesa/work/attach',
    worktrees: '/h/.mesa/work/worktrees',
    checkouts: '/h/.mesa/work/checkouts',
    handoffs: '/h/.mesa/work/handoffs',
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
    skills: ['mesa', 'mesa-handoff', 'mesa-vault'],
    decisions: { backend: 'rules', threshold: 0.7 },
    sessions: { log: true, statusLineCost: false, prEvents: false },
    usage: { dailyAlertUsd: 0, weeklyAlertUsd: 0, monthlyAlertUsd: 0 },
    notifications: {
      quiet: false,
      visualAlert: true,
      inputRequired: 'sound',
      finished: 'silent',
      subagent: 'silent',
      doctor: 'silent',
      automation: 'silent',
    },
    application: { warnBeforeQuit: true, backupOnClose: false },
    onboarding: { status: 'active', step: 0, discovery: 'pending' },
    appearance: DEFAULT_APPEARANCE,
    terminal: { app: 'Terminal', ...DEFAULT_TERMINAL_PREFERENCES },
    editor: { fontSize: 13, tabSize: 2, wordWrap: false, vim: false, external: [] },
    worktrees: {
      location: 'profile',
      fetch: false,
      sparseDirectories: [],
      carryIgnoredDirectories: [],
      setup: [],
      teardown: [],
      deleteBranch: false,
    },
    shortcuts: DEFAULT_SHORTCUTS,
    projects: { sort: 'name' },
    board: { view: 'list', group: 'none', density: 'comfortable', sort: 'attention', order: [] },
    grid: { groups: [] },
    run: { permissionMode: 'acceptEdits', allowedTools: [] },
    agents: { claude: {}, codex: {}, antigravity: {} },
    update: {},
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

test('onboarding.discovery defaults to pending, takes its four states, and refuses any other', () => {
  const paths = profilePaths(tempDir(), 'default');
  initProfile(paths, { vault: '/tmp/v' });
  expect(loadConfig(paths.config).onboarding.discovery).toBe('pending');
  for (const state of ['started', 'complete', 'dismissed', 'pending']) {
    expect(setConfigValue(paths.config, 'onboarding.discovery', state).value).toBe(state);
  }
  expect(thrown(() => setConfigValue(paths.config, 'onboarding.discovery', 'done')).code).toBe(
    'invalid_config',
  );
  expect(loadConfig(paths.config).onboarding.discovery).toBe('pending');
});
