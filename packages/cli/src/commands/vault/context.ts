import { DEFAULT_GOALS, GENERAL_PROJECT, MesaError } from '@mesa/core';
import { defineCommand } from '../../command.js';
import { wholeNumber } from '../../input/flags.js';
import { columns } from '../../output/columns.js';
import { contextText, goalRow } from './text.js';

/** The project a vault read is about: the one named, or General with --general. */
function projectOf(project: string | undefined, general: boolean | undefined): string {
  if (Boolean(project) === Boolean(general)) {
    throw new MesaError('usage', 'pass a project or --general, not both');
  }
  return project ?? GENERAL_PROJECT;
}

const GENERAL_FLAG = {
  type: 'boolean',
  description: 'The General project: the whole vault, and the sessions outside projects',
} as const;

export const vaultContext = defineCommand({
  name: 'vault context',
  summary:
    "A project's bounded overview: its hub, index lines, notes, decisions, and earlier goals",
  args: ['project?'],
  flags: { general: GENERAL_FLAG },
  example: 'mesa vault context lantern-cove',
  run: ({ mesa, args, flags }) => {
    const context = mesa.vault.context(projectOf(args.project, flags.general));
    return { data: context, text: contextText(context) };
  },
});

export const vaultGoals = defineCommand({
  name: 'vault goals',
  summary: "A project's earlier session goals, newest first, the calling session's left out",
  args: ['project?'],
  flags: {
    general: GENERAL_FLAG,
    limit: { type: 'string', description: `How many to list (default ${DEFAULT_GOALS})` },
  },
  example: 'mesa vault goals lantern-cove --limit 5',
  run: ({ mesa, args, flags }) => {
    const goals = mesa.vault.goals(projectOf(args.project, flags.general), {
      limit: flags.limit === undefined ? undefined : wholeNumber(flags.limit, '--limit'),
    });
    return {
      data: goals,
      text: goals.length ? columns(goals.map(goalRow)).join('\n') : 'no earlier sessions',
    };
  },
});
