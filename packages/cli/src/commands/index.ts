import type { Command } from '../command.js';
import { adopt } from './adopt.js';
import { attach } from './attach.js';
import { config, configSet } from './config.js';
import { decide } from './decide.js';
import { doctor } from './doctor.js';
import { goal } from './goal.js';
import { guardrailCheck } from './guardrail.js';
import { handoff } from './handoff.js';
import { help } from './help.js';
import { hook, hookTmux } from './hook.js';
import { hooksInstall, hooksStatus, hooksUninstall } from './hooks.js';
import { init } from './init.js';
import { log } from './log.js';
import { logs } from './logs.js';
import { open } from './open.js';
import { profile } from './profile.js';
import { projects, projectsUpdate } from './projects.js';
import { receipts, receiptsShow } from './receipts.js';
import { register } from './register.js';
import { rename } from './rename.js';
import { resize } from './resize.js';
import { resume } from './resume.js';
import { rm } from './rm.js';
import { run } from './run.js';
import { search } from './search.js';
import { send } from './send.js';
import { sessions } from './sessions.js';
import { show } from './show.js';
import { skillsList, skillsSync } from './skills.js';
import { stop } from './stop.js';
import { unregister } from './unregister.js';
import { vaultInit, vaultOpen, vaultStatus } from './vault.js';
import { view } from './view.js';
import { windows } from './windows.js';

// Every mesa subcommand, in help order. A command lives in the file named for its first word
// (`hooks install` in hooks.ts), and has one entry here.
export const COMMANDS: Command[] = [
  adopt,
  attach,
  config,
  configSet,
  decide,
  doctor,
  goal,
  guardrailCheck,
  handoff,
  help,
  hook,
  hookTmux,
  hooksInstall,
  hooksStatus,
  hooksUninstall,
  init,
  log,
  logs,
  open,
  profile,
  projects,
  projectsUpdate,
  receipts,
  receiptsShow,
  register,
  rename,
  resize,
  resume,
  rm,
  run,
  search,
  send,
  sessions,
  show,
  skillsList,
  skillsSync,
  stop,
  unregister,
  vaultInit,
  vaultOpen,
  vaultStatus,
  view,
  windows,
];
