import type { Command } from '../../command.js';
import {
  automationsAdd,
  automationsDisable,
  automationsEnable,
  automationsList,
  automationsRemove,
} from './rules.js';
import { automationsApprove, automationsCancel } from './runs.js';
import {
  automationsInstall,
  automationsStatus,
  automationsTick,
  automationsUninstall,
} from './scheduler.js';

// Every `mesa automations` subcommand, in help order.
export const AUTOMATIONS_COMMANDS: Command[] = [
  automationsList,
  automationsInstall,
  automationsUninstall,
  automationsStatus,
  automationsTick,
  automationsApprove,
  automationsCancel,
  automationsAdd,
  automationsRemove,
  automationsEnable,
  automationsDisable,
];
