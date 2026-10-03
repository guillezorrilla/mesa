import type { Result } from '@mesa/core';
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
import { updateCommands } from './update';
import { usageCommands } from './usage';
import { vaultCommands } from './vault';
import { worktreesCommands } from './worktrees';

/** Sends one mesa argv and resolves with the envelope it printed. The seam between the renderer and the CLI. */
export type Bridge = (args: string[]) => Promise<unknown>;

/** Every command the app runs: its mesa argv and the type of its data. The client adds --json. */
const COMMANDS = {
  ...aboutCommands,
  ...automationsCommands,
  ...sessionsCommands,
  ...reviewCommands,
  ...projectsCommands,
  ...filesCommands,
  ...gitCommands,
  ...worktreesCommands,
  ...skillsCommands,
  ...rulesCommands,
  ...sourcesCommands,
  ...importsCommands,
  ...vaultCommands,
  ...settingsCommands,
  ...notificationsCommands,
  ...doctorCommands,
  ...usageCommands,
  ...updateCommands,
};

export type CommandName = keyof typeof COMMANDS;
export type DataOf<K extends CommandName> = (typeof COMMANDS)[K] extends { data?: infer D }
  ? D
  : never;
type ArgsOf<K extends CommandName> = (typeof COMMANDS)[K] extends {
  argv: (args: infer A) => string[];
}
  ? A
  : never;
/** Commands without arguments take none; the others require theirs. */
export type CallArgs<K extends CommandName> = [ArgsOf<K>] extends [undefined] ? [] : [ArgsOf<K>];

export function createClient(bridge: Bridge) {
  return {
    /** Resolves with the envelope; rejects only when mesa printed none (see run_mesa). */
    call<K extends CommandName>(name: K, ...args: CallArgs<K>): Promise<Result<DataOf<K>>> {
      const argv = (COMMANDS[name].argv as (args: unknown) => string[])(args[0]);
      // --json first: global flags may precede the command, and never follow a `--`.
      return bridge(['--json', ...argv]) as Promise<Result<DataOf<K>>>;
    },
  };
}

export type Client = ReturnType<typeof createClient>;
