import type { Command } from '../command.js';
import { adopt } from './adopt.js';
import { agents } from './agents.js';
import { archive } from './archive.js';
import { attach } from './attach.js';
import { backupCreate, backupRestore } from './backup.js';
import { board, boardMove } from './board.js';
import {
  browserAnnotationPreview,
  browserAnnotationSend,
  browserClear,
  browserExternal,
  browserSelect,
} from './browser.js';
import { config, configSet } from './config.js';
import { daily } from './daily.js';
import { decide } from './decide.js';
import { dependency } from './dependency.js';
import { diagnostics } from './diagnostics.js';
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
import { imagePreview, imageSend } from './image.js';
import { init } from './init.js';
import { log } from './log.js';
import { logs } from './logs.js';
import { map } from './map.js';
import {
  notifications,
  notificationsClear,
  notificationsDelivered,
  notificationsDelivery,
  notificationsRead,
} from './notifications.js';
import { open } from './open.js';
import { prEvents } from './pr-events.js';
import { profile } from './profile.js';
import {
  projects,
  projectsClone,
  projectsDiscover,
  projectsSet,
  projectsTrust,
  projectsUpdate,
  projectsVisit,
} from './projects.js';
import { prompts, promptsRemove, promptsSave } from './prompts.js';
import { receipts, receiptsShow } from './receipts.js';
import { register } from './register.js';
import { rename } from './rename.js';
import { resize } from './resize.js';
import { resume } from './resume.js';
import {
  reviewChangePreview,
  reviewChangeSend,
  reviewChanges,
  reviewPreview,
  reviewResponses,
  reviewSend,
} from './review.js';
import { rewind } from './rewind.js';
import { rm } from './rm.js';
import { rulesList, rulesRead, rulesWrite } from './rules.js';
import { run } from './run.js';
import { search } from './search.js';
import { send } from './send.js';
import { sessions } from './sessions.js';
import { show } from './show.js';
import { skillsList, skillsRead, skillsSet, skillsSync, skillsWrite } from './skills.js';
import { statusline } from './statusline.js';
import { stop } from './stop.js';
import { swap } from './swap.js';
import { unarchive } from './unarchive.js';
import { unregister } from './unregister.js';
import { usage } from './usage.js';
import {
  vaultBases,
  vaultContext,
  vaultGoals,
  vaultInit,
  vaultList,
  vaultMcp,
  vaultOpen,
  vaultRead,
  vaultSaveDecision,
  vaultSaveNote,
  vaultSaveSummary,
  vaultSearch,
  vaultStatus,
} from './vault.js';
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
  backupCreate,
  backupRestore,
  board,
  boardMove,
  browserAnnotationPreview,
  browserAnnotationSend,
  browserSelect,
  browserClear,
  browserExternal,
  config,
  configSet,
  dependency,
  decide,
  daily,
  diagnostics,
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
  imagePreview,
  imageSend,
  init,
  log,
  logs,
  map,
  notifications,
  notificationsRead,
  notificationsClear,
  notificationsDelivery,
  notificationsDelivered,
  open,
  prEvents,
  profile,
  prompts,
  promptsSave,
  promptsRemove,
  projects,
  projectsClone,
  projectsDiscover,
  projectsSet,
  projectsTrust,
  projectsUpdate,
  projectsVisit,
  receipts,
  receiptsShow,
  register,
  rename,
  rewind,
  reviewResponses,
  reviewPreview,
  reviewSend,
  reviewChanges,
  reviewChangePreview,
  reviewChangeSend,
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
  swap,
  skillsList,
  skillsRead,
  skillsSet,
  skillsSync,
  skillsWrite,
  statusline,
  stop,
  unregister,
  unarchive,
  usage,
  vaultBases,
  vaultInit,
  vaultList,
  vaultMcp,
  vaultOpen,
  vaultRead,
  vaultSaveDecision,
  vaultSaveNote,
  vaultSaveSummary,
  vaultSearch,
  vaultStatus,
  vaultContext,
  vaultGoals,
  view,
  windows,
  workflow,
  worktreesCreate,
  worktreesList,
  worktreesRerun,
  worktreesPreview,
  worktreesApply,
];
