import type { Command } from '../command.js';
import { config, configSet } from './config.js';
import { doctor } from './doctor.js';
import { init } from './init.js';
import { profile } from './profile.js';
import { projects, register, unregister } from './projects.js';
import { vaultInit, vaultStatus } from './vault.js';

// Every mesa subcommand, in help order. A new command is one file and one entry here.
export const COMMANDS: Command[] = [
  config,
  configSet,
  doctor,
  init,
  profile,
  projects,
  register,
  unregister,
  vaultInit,
  vaultStatus,
];
