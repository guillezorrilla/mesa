import type { Command } from '../command.js';
import { about, aboutLicenses } from './about.js';
import { adopt } from './adopt.js';
import { agents } from './agents.js';
import { archive } from './archive.js';
import { attach } from './attach.js';
import { AUTOMATIONS_COMMANDS } from './automations/index.js';
import { backupCreate, backupRestore } from './backup.js';
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
import {
  decisionsKeyList,
  decisionsKeyRemove,
  decisionsKeySet,
  decisionsUse,
} from './decisions.js';
import { dependency } from './dependency.js';
import { diagnostics } from './diagnostics.js';
import { discover, discoverAdopt } from './discover.js';
import { doctor, doctorInstall } from './doctor.js';
import { FILES_COMMANDS } from './files/index.js';
import { forceStart } from './force-start.js';
import { fork } from './fork.js';
import { GIT_COMMANDS } from './git/index.js';
import { goal } from './goal.js';
import { grid, gridRemove, gridSave } from './grid.js';
import { guardrailCheck } from './guardrail.js';
import { handoff } from './handoff.js';
import { help } from './help.js';
import { history, historySearch } from './history.js';
import { hook, hookTmux } from './hook.js';
import { hooksInstall, hooksStatus, hooksUninstall } from './hooks.js';
import { imagePreview, imageSend } from './image.js';
import { importGoal, importLinks, importList, importRefresh } from './import.js';
import { init } from './init.js';
import { instructionsList, instructionsRead, instructionsWrite } from './instructions.js';
import { log } from './log.js';
import { logs } from './logs.js';
import { map } from './map.js';
import {
  notifications,
  notificationsClear,
  notificationsDeliver,
  notificationsDelivered,
  notificationsDelivery,
  notificationsRead,
} from './notifications.js';
import { obsidianVaults } from './obsidian.js';
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
import { run } from './run.js';
import { search } from './search.js';
import { send } from './send.js';
import { sessions } from './sessions.js';
import { show } from './show.js';
import { skillsList, skillsRead, skillsSet, skillsSync, skillsWrite } from './skills.js';
import { sourcesBrowse, sourcesConnect, sourcesDisconnect, sourcesList } from './sources.js';
import { statusline } from './statusline.js';
import { stop } from './stop.js';
import { swap } from './swap.js';
import { unarchive } from './unarchive.js';
import { unregister } from './unregister.js';
import { updateChannel, updateCheck, updateInstall, updateRevoked } from './update.js';
import { usage } from './usage.js';
import { VAULT_COMMANDS } from './vault/index.js';
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
// (`hooks install` in hooks.ts); a first word past the size rule in AGENTS.md, Code shape, is a
// folder whose index.ts lists it (`vault save note` in vault/). Each has one entry here.
export const COMMANDS: Command[] = [
  about,
  aboutLicenses,
  adopt,
  agents,
  archive,
  attach,
  ...AUTOMATIONS_COMMANDS,
  backupCreate,
  backupRestore,
  browserAnnotationPreview,
  browserAnnotationSend,
  browserSelect,
  browserClear,
  browserExternal,
  config,
  configSet,
  dependency,
  decide,
  decisionsKeySet,
  decisionsKeyList,
  decisionsKeyRemove,
  decisionsUse,
  daily,
  diagnostics,
  discover,
  discoverAdopt,
  doctor,
  doctorInstall,
  obsidianVaults,
  ...FILES_COMMANDS,
  fork,
  forceStart,
  goal,
  ...GIT_COMMANDS,
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
  importLinks,
  importList,
  importRefresh,
  importGoal,
  init,
  instructionsList,
  instructionsRead,
  instructionsWrite,
  log,
  logs,
  map,
  notifications,
  notificationsRead,
  notificationsClear,
  notificationsDeliver,
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
  sourcesConnect,
  sourcesList,
  sourcesDisconnect,
  sourcesBrowse,
  statusline,
  stop,
  unregister,
  unarchive,
  updateCheck,
  updateChannel,
  updateInstall,
  updateRevoked,
  usage,
  ...VAULT_COMMANDS,
  view,
  windows,
  workflow,
  worktreesCreate,
  worktreesList,
  worktreesRerun,
  worktreesPreview,
  worktreesApply,
];
