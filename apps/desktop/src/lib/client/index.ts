import type { Result } from '@mesa/core';
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
import type { Spec } from './spec';
import { updateCommands } from './update';
import { usageCommands } from './usage';
import { vaultCommands } from './vault';
import { worktreesCommands } from './worktrees';

/**
 * Sends one mesa argv, with `stdin` on its stdin when given (a secret, never argv), and resolves
 * with the envelope it printed. The seam between the renderer and the CLI.
 */
export type Bridge = (args: string[], stdin?: string) => Promise<unknown>;

/** Every command the app runs: its mesa argv and the type of its data. The client adds --json. */
const COMMANDS = {
  ...aboutCommands,
  ...automationsCommands,
  ...decisionsCommands,
  ...sessionsCommands,
  ...reviewCommands,
  ...projectsCommands,
  ...filesCommands,
  ...gitCommands,
  ...worktreesCommands,
  ...skillsCommands,
  ...instructionsCommands,
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
      const spec = COMMANDS[name] as Spec<unknown, unknown>;
      const argv = spec.argv(args[0]);
      const stdin = spec.stdin?.(args[0]);
      // --json first: global flags may precede the command, and never follow a `--`.
      const sent =
        stdin === undefined ? bridge(['--json', ...argv]) : bridge(['--json', ...argv], stdin);
      return sent as Promise<Result<DataOf<K>>>;
    },
  };
}

export type Client = ReturnType<typeof createClient>;
