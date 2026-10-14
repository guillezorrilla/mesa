import type { Command } from '../../command.js';
import { prs, prsSetup } from './list.js';
import { prsDiff, prsDiscard, prsDraft, prsDrafts, prsShow } from './pr.js';
import { prsPublish, prsStart, prsVerdict } from './review.js';

// Every `mesa prs` subcommand, in help order.
export const PRS_COMMANDS: Command[] = [
  prs,
  prsSetup,
  prsShow,
  prsDiff,
  prsDraft,
  prsDrafts,
  prsDiscard,
  prsStart,
  prsPublish,
  prsVerdict,
];
