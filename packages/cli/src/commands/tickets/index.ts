import type { Command } from '../../command.js';
import { ticketsFields, ticketsFieldsSet } from './fields.js';
import { ticketsBoards, ticketsFilters } from './jira.js';
import { tickets } from './list.js';
import { ticketsAssign, ticketsDefaults, ticketsShow } from './ticket.js';
import {
  ticketsFollow,
  ticketsPreview,
  ticketsPrompt,
  ticketsTracker,
  ticketsUnfollow,
  ticketsViews,
  ticketsViewsAdd,
  ticketsViewsRemove,
  ticketsViewsRename,
} from './views.js';

// Every `mesa tickets` subcommand, in help order.
export const TICKETS_COMMANDS: Command[] = [
  tickets,
  ticketsShow,
  ticketsAssign,
  ticketsViews,
  ticketsViewsAdd,
  ticketsViewsRename,
  ticketsViewsRemove,
  ticketsPreview,
  ticketsFollow,
  ticketsUnfollow,
  ticketsTracker,
  ticketsPrompt,
  ticketsDefaults,
  ticketsFields,
  ticketsFieldsSet,
  ticketsBoards,
  ticketsFilters,
];
