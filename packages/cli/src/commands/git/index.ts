import type { Command } from '../../command.js';
import { gitBranchCheckout, gitBranchCreate, gitBranchDelete, gitBranches } from './branches.js';
import { gitCommit, gitDiff, gitStage, gitStatus, gitUnstage } from './changes.js';
import { gitDiscard } from './discard.js';
import { gitFix, gitResolve } from './handoff.js';
import { gitCompare, gitGraph } from './history.js';
import { gitInsight } from './insight.js';
import { gitStashApply, gitStashCreate, gitStashDrop, gitStashes, gitStashPop } from './stash.js';
import { gitPull, gitPush, gitTracking } from './sync.js';
import { gitMessage, gitPrText } from './text.js';

// Every `mesa git` subcommand, in help order.
export const GIT_COMMANDS: Command[] = [
  gitBranchCheckout,
  gitBranchCreate,
  gitBranchDelete,
  gitBranches,
  gitCommit,
  gitCompare,
  gitDiff,
  gitDiscard,
  gitFix,
  gitGraph,
  gitInsight,
  gitMessage,
  gitPrText,
  gitPull,
  gitPush,
  gitResolve,
  gitStage,
  gitStashApply,
  gitStashCreate,
  gitStashDrop,
  gitStashPop,
  gitStashes,
  gitStatus,
  gitTracking,
  gitUnstage,
];
