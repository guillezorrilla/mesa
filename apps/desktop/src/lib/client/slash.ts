import type { SlashCommand } from '@mesa/core';
import { commandWith } from './spec';

/** The slash commands a session's agent offers, for the chat composer's menu. */
export const slashCommandsCommands = {
  'commands.list': commandWith<{ target: string }, SlashCommand[]>(({ target }) => [
    'commands',
    '--',
    target,
  ]),
};
