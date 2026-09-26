import type { Command } from '../command.js';
import { attach } from './attach.js';
import { config, configSet } from './config.js';
import { decide } from './decide.js';
import { doctor } from './doctor.js';
import { goal } from './goal.js';
import { help } from './help.js';
import { hook, hooksInstall, hooksStatus, hooksUninstall, hookTmux } from './hooks.js';
import { init } from './init.js';
import { log } from './log.js';
import { open } from './open.js';
import { profile } from './profile.js';
import { projects, register, unregister } from './projects.js';
import { receipts, receiptsShow } from './receipts.js';
import { resize } from './resize.js';
import { resume } from './resume.js';
import { send } from './send.js';
import { sessions } from './sessions.js';
import { stop } from './stop.js';
import { vaultInit, vaultOpen, vaultStatus } from './vault.js';
import { windows } from './windows.js';

// Every mesa subcommand, in help order. A new command is one file and one entry here.
export const COMMANDS: Command[] = [
  attach,
  config,
  configSet,
  decide,
  doctor,
  goal,
  help,
  hook,
  hookTmux,
  hooksInstall,
  hooksStatus,
  hooksUninstall,
  init,
  log,
  open,
  profile,
  projects,
  receipts,
  receiptsShow,
  register,
  resize,
  resume,
  send,
  sessions,
  stop,
  unregister,
  vaultInit,
  vaultOpen,
  vaultStatus,
  windows,
];
