import { MesaError } from '@mesa/core';
import { defineCommand } from '../../command.js';
import { onOff, VIEW_FLAGS } from '../../input/flags.js';
import { recordedOutput } from '../../output/recorded.js';

const { site } = VIEW_FLAGS;

export const ticketsShow = defineCommand({
  name: 'tickets show',
  summary: 'Show one Jira ticket: its fields, description and comments, and the sessions on it',
  args: ['key'],
  flags: { site },
  example: 'mesa tickets show LC-12',
  run: async ({ mesa, args, flags }) => {
    const data = await mesa.tickets.show(args.key, flags.site);
    const facts = [
      data.status,
      data.priority,
      data.assignee ? `${data.assignee.name}${data.mine ? ' (you)' : ''}` : 'Unassigned',
      ...data.labels,
    ].filter(Boolean);
    const running = data.sessions.map((s) => `Live in ${s.project} (${s.id})`);
    const comments = data.comments.map((c) => `${c.author}, ${c.created}:\n${c.markdown}`);
    const text = [
      `${data.key}: ${data.summary}`,
      facts.join(' · '),
      data.url,
      ...running,
      '',
      data.description || 'No description.',
      ...(comments.length ? ['', ...comments] : []),
    ].join('\n');
    return { data, text };
  },
});

export const ticketsAssign = defineCommand({
  name: 'tickets assign',
  summary: 'Assign a Jira ticket to you: the one change Mesa makes in Jira',
  args: ['key'],
  flags: { site },
  example: 'mesa tickets assign LC-12',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.tickets.assign(args.key, flags.site);
    const { key, assignee } = recorded.result;
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `Assigned ${key} to ${assignee}`,
    });
  },
});

export const ticketsDefaults = defineCommand({
  name: 'tickets defaults',
  summary: "Show or change a project's defaults for a session started from a ticket",
  args: ['project'],
  flags: {
    notes: { type: 'string', description: 'Write notes before the session starts: on or off' },
    assign: {
      type: 'string',
      description: "Assign the ticket to you when it isn't yours: on or off",
    },
    start: {
      type: 'string',
      description: 'worktree (a new one, on a branch named after the ticket) or checkout',
    },
    'until-done': {
      type: 'string',
      description: "Start as Claude Code's /goal, working until the ticket is done: on or off",
    },
  },
  example: 'mesa tickets defaults lantern-cove --start checkout',
  run: ({ mesa, args, flags }) => {
    if (flags.start !== undefined && flags.start !== 'worktree' && flags.start !== 'checkout')
      throw new MesaError('usage', '--start is worktree or checkout');
    const notes = onOff('notes', flags.notes);
    const assign = onOff('assign', flags.assign);
    const done = onOff('until-done', flags['until-done']);
    const change = {
      ...(notes === undefined ? {} : { notes }),
      ...(assign === undefined ? {} : { assign }),
      ...(flags.start ? { start: flags.start as 'worktree' | 'checkout' } : {}),
      ...(done === undefined ? {} : { untilDone: done }),
    };
    const data = Object.keys(change).length
      ? mesa.tickets.setDefaults(args.project, change)
      : mesa.tickets.defaults(args.project);
    const text = `notes ${data.notes ? 'on' : 'off'}, assign ${data.assign ? 'on' : 'off'}, start in ${data.start === 'worktree' ? 'a new worktree' : 'the main checkout'}, until done ${data.untilDone ? 'on' : 'off'}`;
    return { data, text };
  },
});
