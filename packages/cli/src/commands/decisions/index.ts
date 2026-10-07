import type { Command } from '../../command.js';
import { decisionsAdvise, decisionsContext, decisionsEvaluate } from './evaluate.js';
import { decisionsKeyList, decisionsKeyRemove, decisionsKeySet, decisionsUse } from './keys.js';
import { decisionsMcp } from './mcp.js';
import { decisionsPlace } from './place.js';
import { decisionsOff, decisionsOn, decisionsPrepare, decisionsStatus } from './session.js';

// Every `mesa decisions` subcommand, in help order.
export const DECISIONS_COMMANDS: Command[] = [
  decisionsKeySet,
  decisionsKeyList,
  decisionsKeyRemove,
  decisionsUse,
  decisionsPlace,
  decisionsEvaluate,
  decisionsContext,
  decisionsAdvise,
  decisionsStatus,
  decisionsOff,
  decisionsOn,
  decisionsPrepare,
  decisionsMcp,
];
