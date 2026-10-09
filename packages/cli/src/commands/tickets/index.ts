import type { Command } from '../../command.js';
import { ticketsBoards, ticketsFilters } from './jira.js';
import { tickets } from './list.js';
import {
  ticketsFollow,
  ticketsPrompt,
  ticketsUnfollow,
  ticketsViews,
  ticketsViewsAdd,
  ticketsViewsRemove,
} from './views.js';

// Every `mesa tickets` subcommand, in help order.
export const TICKETS_COMMANDS: Command[] = [
  tickets,
  ticketsViews,
  ticketsViewsAdd,
  ticketsViewsRemove,
  ticketsFollow,
  ticketsUnfollow,
  ticketsPrompt,
  ticketsBoards,
  ticketsFilters,
];
