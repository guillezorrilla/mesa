import type { Command } from '../../command.js';
import { vaultContext, vaultGoals } from './context.js';
import { vaultHealth } from './health.js';
import { vaultList, vaultOpen, vaultRead, vaultSearch } from './items.js';
import { vaultBases, vaultInit, vaultStatus } from './layout.js';
import { vaultMcp } from './mcp.js';
import { vaultSaveDecision, vaultSaveNote, vaultSaveSummary } from './save.js';

// Every `mesa vault` subcommand, in help order.
export const VAULT_COMMANDS: Command[] = [
  vaultHealth,
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
];
