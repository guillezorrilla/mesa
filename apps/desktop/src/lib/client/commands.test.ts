import { expect, test } from 'vitest';
import { aboutCommands } from './about';
import { automationsCommands } from './automations';
import { decisionsCommands } from './decisions';
import { doctorCommands } from './doctor';
import { filesCommands } from './files';
import { gitCommands } from './git';
import { importsCommands } from './imports';
import { instructionsCommands } from './instructions';
import { notificationsCommands } from './notifications';
import { projectsCommands } from './projects';
import { reviewCommands } from './review';
import { sessionsCommands } from './sessions';
import { settingsCommands } from './settings';
import { skillsCommands } from './skills';
import { sourcesCommands } from './sources';
import { usageCommands } from './usage';
import { vaultCommands } from './vault';
import { worktreesCommands } from './worktrees';

// COMMANDS spreads the domain tables, so a name in two of them would silently keep the last.
test('no command name is defined by two domain tables', () => {
  const names = [
    aboutCommands,
    automationsCommands,
    decisionsCommands,
    doctorCommands,
    filesCommands,
    gitCommands,
    importsCommands,
    notificationsCommands,
    projectsCommands,
    reviewCommands,
    instructionsCommands,
    sessionsCommands,
    settingsCommands,
    skillsCommands,
    sourcesCommands,
    usageCommands,
    vaultCommands,
    worktreesCommands,
  ].flatMap(Object.keys);
  expect(names.filter((name, at) => names.indexOf(name) !== at)).toEqual([]);
});

test('decisions.keys.set puts the key on stdin and never in argv', () => {
  const set = decisionsCommands['decisions.keys.set'];
  const args = { provider: 'cloudflare' as const, key: 'cf-test-key', account: 'acct-0001' };
  expect(set.argv(args)).toEqual([
    'decisions',
    'key',
    'set',
    '--account',
    'acct-0001',
    '--',
    'cloudflare',
  ]);
  expect(set.stdin?.(args)).toBe('cf-test-key');
});

test("sessions.open names each additional project with --with=, before the session's branch", () => {
  const open = sessionsCommands['sessions.open'].argv;
  expect(open({ project: 'lantern-cove', with: ['tide-pool', 'harbor'], worktree: true })).toEqual([
    'open',
    '--no-parent',
    '--with=tide-pool',
    '--with=harbor',
    '--worktree',
    '--',
    'lantern-cove',
  ]);
  expect(open({ project: 'lantern-cove', with: ['tide-pool'], branch: 'shared' })).toEqual([
    'open',
    '--no-parent',
    '--with=tide-pool',
    '--branch=shared',
    '--',
    'lantern-cove',
  ]);
});
