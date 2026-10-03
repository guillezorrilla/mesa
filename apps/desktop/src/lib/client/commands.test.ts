import { expect, test } from 'vitest';
import { aboutCommands } from './about';
import { automationsCommands } from './automations';
import { doctorCommands } from './doctor';
import { filesCommands } from './files';
import { gitCommands } from './git';
import { importsCommands } from './imports';
import { notificationsCommands } from './notifications';
import { projectsCommands } from './projects';
import { reviewCommands } from './review';
import { rulesCommands } from './rules';
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
    doctorCommands,
    filesCommands,
    gitCommands,
    importsCommands,
    notificationsCommands,
    projectsCommands,
    reviewCommands,
    rulesCommands,
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
