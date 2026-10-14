import type { Command } from '../../command.js';
import { prs, prsSetup } from './list.js';
import { prsDiscard, prsDraft, prsDrafts, prsShow } from './pr.js';
import { prsPublish, prsStart, prsVerdict } from './review.js';

// Every `mesa prs` subcommand, in help order.
export const PRS_COMMANDS: Command[] = [
  prs,
  prsSetup,
  prsShow,
  prsDraft,
  prsDrafts,
  prsDiscard,
  prsStart,
  prsPublish,
  prsVerdict,
];
