import type { Command } from '../../command.js';
import { prs, prsSetup } from './list.js';
import { prsMerge } from './merge.js';
import { prsDiff, prsDiscard, prsDraft, prsDrafts, prsResolve, prsShow } from './pr.js';
import { prsPublish, prsStart, prsVerdict } from './review.js';
import { prsVoice } from './voice.js';

// Every `mesa prs` subcommand, in help order.
export const PRS_COMMANDS: Command[] = [
  prs,
  prsSetup,
  prsShow,
  prsDiff,
  prsDraft,
  prsDrafts,
  prsDiscard,
  prsResolve,
  prsStart,
  prsPublish,
  prsMerge,
  prsVerdict,
  prsVoice,
];
