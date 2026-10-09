import { MesaError } from '@mesa/core';
import { defineCommand } from '../../command.js';

export const ticketsViews = defineCommand({
  name: 'tickets views',
  summary: "List the profile's Jira ticket views and the projects following each",
  example: 'mesa tickets views',
  run: ({ mesa }) => {
    const data = mesa.tickets.views();
    const lines = data.map(
      (view) =>
        `${view.name}: ${view.describe}${view.following.length ? ` (followed by ${view.following.join(', ')})` : ''}`,
    );
    return { data, text: lines.length ? lines.join('\n') : 'No ticket views.' };
  },
});

export const ticketsViewsAdd = defineCommand({
  name: 'tickets views add',
  summary: "Define a view: a board's current or next sprint, a saved filter, or JQL",
  args: ['name'],
  flags: {
    board: { type: 'string', description: "A board's id: the view reads its sprint" },
    sprint: { type: 'string', description: 'current (default) or next, with --board' },
    filter: { type: 'string', description: "A saved filter's id" },
    jql: { type: 'string', description: 'A JQL query' },
    everyone: { type: 'boolean', description: "Every assignee's tickets, not only yours" },
    'show-done': { type: 'boolean', description: 'Done tickets too' },
    site: {
      type: 'string',
      description: 'The Atlassian site, when the connection reaches several',
    },
  },
  example: 'mesa tickets views add sprint --board 42',
  run: async ({ mesa, args, flags }) => {
    const board = flags.board === undefined ? undefined : Number(flags.board);
    if (board !== undefined && !(Number.isInteger(board) && board > 0))
      throw new MesaError('usage', '--board takes a board id; see mesa tickets boards');
    if (flags.sprint !== undefined && flags.sprint !== 'current' && flags.sprint !== 'next')
      throw new MesaError('usage', '--sprint is current or next');
    const data = await mesa.tickets.addView({
      name: args.name,
      ...(board !== undefined ? { board } : {}),
      ...(flags.sprint ? { sprint: flags.sprint } : {}),
      ...(flags.filter !== undefined ? { filter: flags.filter } : {}),
      ...(flags.jql !== undefined ? { jql: flags.jql } : {}),
      ...(flags.everyone ? { everyone: true } : {}),
      ...(flags['show-done'] ? { showDone: true } : {}),
      ...(flags.site ? { site: flags.site } : {}),
    });
    return { data, text: `Added ${data.name}: ${data.describe}` };
  },
});

export const ticketsViewsRemove = defineCommand({
  name: 'tickets views remove',
  summary: 'Remove a view, and every project follow of it',
  args: ['name'],
  example: 'mesa tickets views remove sprint',
  run: ({ mesa, args }) => {
    const data = mesa.tickets.removeView(args.name);
    return { data, text: `Removed ${data.name}` };
  },
});

export const ticketsFollow = defineCommand({
  name: 'tickets follow',
  summary: "List a view's tickets in a project's Tickets tab",
  args: ['project', 'view'],
  example: 'mesa tickets follow lantern-cove sprint',
  run: ({ mesa, args }) => {
    const data = mesa.tickets.follow(args.project, args.view);
    return { data, text: `${data.project} follows ${data.following.join(', ')}` };
  },
});

export const ticketsUnfollow = defineCommand({
  name: 'tickets unfollow',
  summary: "Stop listing a view's tickets in a project",
  args: ['project', 'view'],
  example: 'mesa tickets unfollow lantern-cove sprint',
  run: ({ mesa, args }) => {
    const data = mesa.tickets.unfollow(args.project, args.view);
    return {
      data,
      text: data.following.length
        ? `${data.project} follows ${data.following.join(', ')}`
        : `${data.project} follows no ticket views`,
    };
  },
});

export const ticketsPrompt = defineCommand({
  name: 'tickets prompt',
  summary: 'Set the Saved prompt a session from a Jira ticket gets, for the profile or a project',
  args: ['name?'],
  flags: {
    project: { type: 'string', description: "Set this project's own, over the profile's" },
    clear: { type: 'boolean', description: 'Clear it' },
  },
  example: 'mesa tickets prompt "Ticket flow" --project lantern-cove',
  run: ({ mesa, args, flags }) => {
    if (Boolean(args.name) === Boolean(flags.clear))
      throw new MesaError('usage', 'name a saved prompt, or pass --clear');
    const data = mesa.tickets.setPrompt(flags.clear ? undefined : args.name, flags.project);
    const scope = data.project ?? 'the profile';
    return {
      data,
      text: data.prompt
        ? `Ticket prompt for ${scope}: ${data.prompt}`
        : `Cleared ${scope}'s ticket prompt`,
    };
  },
});
