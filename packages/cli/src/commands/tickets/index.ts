import type { Command } from '../../command.js';
import { ticketsBoards, ticketsFilters } from './jira.js';
import { tickets } from './list.js';
import { ticketsAssign, ticketsDefaults, ticketsShow } from './ticket.js';
import {
  ticketsFollow,
  ticketsPreview,
  ticketsPrompt,
  ticketsUnfollow,
  ticketsViews,
  ticketsViewsAdd,
  ticketsViewsRemove,
} from './views.js';

// Every `mesa tickets` subcommand, in help order.
export const TICKETS_COMMANDS: Command[] = [
  tickets,
  ticketsShow,
  ticketsAssign,
  ticketsViews,
  ticketsViewsAdd,
  ticketsViewsRemove,
  ticketsPreview,
  ticketsFollow,
  ticketsUnfollow,
  ticketsPrompt,
  ticketsDefaults,
  ticketsBoards,
  ticketsFilters,
];
