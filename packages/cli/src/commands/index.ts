import type { Command } from '../command.js';
import { adopt } from './adopt.js';
import { agents } from './agents.js';
import { archive } from './archive.js';
import { attach } from './attach.js';
import { board, boardMove } from './board.js';
import { config, configSet } from './config.js';
import { decide } from './decide.js';
import { dependency } from './dependency.js';
import { doctor } from './doctor.js';
import {
  filesCreate,
  filesDelete,
  filesLink,
  filesOpen,
  filesRead,
  filesRename,
  filesSearch,
  filesTree,
  filesWrite,
} from './files.js';
import { forceStart } from './force-start.js';
import { fork } from './fork.js';
import {
  gitBranchCheckout,
  gitBranchCreate,
  gitBranchDelete,
  gitBranches,
  gitCommit,
  gitCompare,
  gitDiff,
  gitGraph,
  gitInsight,
  gitPull,
  gitPush,
  gitStage,
  gitStashApply,
  gitStashCreate,
  gitStashDrop,
  gitStashes,
  gitStashPop,
  gitStatus,
  gitTracking,
  gitUnstage,
} from './git.js';
import { goal } from './goal.js';
import { grid, gridRemove, gridSave } from './grid.js';
import { guardrailCheck } from './guardrail.js';
import { handoff } from './handoff.js';
import { help } from './help.js';
import { history, historySearch } from './history.js';
import { hook, hookTmux } from './hook.js';
import { hooksInstall, hooksStatus, hooksUninstall } from './hooks.js';
import { init } from './init.js';
import { log } from './log.js';
import { logs } from './logs.js';
import { open } from './open.js';
import { profile } from './profile.js';
import { projects, projectsClone, projectsDiscover, projectsUpdate } from './projects.js';
import { receipts, receiptsShow } from './receipts.js';
import { register } from './register.js';
import { rename } from './rename.js';
import { resize } from './resize.js';
import { resume } from './resume.js';
import { rm } from './rm.js';
import { rulesList, rulesRead, rulesWrite } from './rules.js';
import { run } from './run.js';
import { search } from './search.js';
import { send } from './send.js';
import { sessions } from './sessions.js';
import { show } from './show.js';
import { skillsList, skillsRead, skillsSync, skillsWrite } from './skills.js';
import { stop } from './stop.js';
import { unarchive } from './unarchive.js';
import { unregister } from './unregister.js';
import { vaultInit, vaultOpen, vaultStatus } from './vault.js';
import { view } from './view.js';
import { windows } from './windows.js';
import { workflow } from './workflow.js';
import {
  worktreesApply,
  worktreesCreate,
  worktreesList,
  worktreesPreview,
  worktreesRerun,
} from './worktrees.js';

// Every mesa subcommand, in help order. A command lives in the file named for its first word
// (`hooks install` in hooks.ts), and has one entry here.
export const COMMANDS: Command[] = [
  adopt,
  agents,
  archive,
  attach,
  board,
  boardMove,
  config,
  configSet,
  dependency,
  decide,
  doctor,
  filesCreate,
  filesDelete,
  filesLink,
  filesOpen,
  filesRead,
  filesRename,
  filesSearch,
  filesTree,
  filesWrite,
  fork,
  forceStart,
  goal,
  gitBranchCheckout,
  gitBranchCreate,
  gitBranchDelete,
  gitBranches,
  gitCommit,
  gitCompare,
  gitDiff,
  gitGraph,
  gitInsight,
  gitPull,
  gitPush,
  gitStage,
  gitStashApply,
  gitStashCreate,
  gitStashDrop,
  gitStashPop,
  gitStashes,
  gitStatus,
  gitTracking,
  gitUnstage,
  grid,
  gridSave,
  gridRemove,
  guardrailCheck,
  handoff,
  history,
  historySearch,
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
  projectsClone,
  projectsDiscover,
  projectsUpdate,
  receipts,
  receiptsShow,
  register,
  rename,
  rulesList,
  rulesRead,
  rulesWrite,
  resize,
  resume,
  rm,
  run,
  search,
  send,
  sessions,
  show,
  skillsList,
  skillsRead,
  skillsSync,
  skillsWrite,
  stop,
  unregister,
  unarchive,
  vaultInit,
  vaultOpen,
  vaultStatus,
  view,
  windows,
  workflow,
  worktreesCreate,
  worktreesList,
  worktreesRerun,
  worktreesPreview,
  worktreesApply,
];
