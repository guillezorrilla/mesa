import type { HooksStatus } from '@mesa/core';
import { defineCommand } from '../command.js';
import { withReceipt } from '../receipt-output.js';

const listed = (s: HooksStatus) =>
  Object.entries(s.events)
    .map(([event, on]) => `${on ? 'ok  ' : 'MISS'} ${event}`)
    .join('\n');

export const hooksStatus = defineCommand({
  name: 'hooks status',
  summary: "Show which of Mesa's Claude Code hooks are in ~/.claude/settings.json",
  example: 'mesa hooks status',
  run: ({ mesa }) => {
    const status = mesa.hooks.status();
    return { data: status, text: `${status.path}\n${listed(status)}` };
  },
});

export const hooksInstall = defineCommand({
  name: 'hooks install',
  summary: "Add Mesa's hooks to Claude Code's user settings; the user's own hooks stay as they are",
  example: 'mesa hooks install',
  run: ({ mesa }) => {
    const recorded = mesa.hooks.install();
    const { changed, ...status } = recorded.result;
    const said = changed ? `installed Mesa's hooks in ${status.path}` : 'hooks already installed';
    const { receipt, text } = withReceipt(recorded, said);
    return { data: { ...status, changed, ...receipt }, text };
  },
});

export const hooksUninstall = defineCommand({
  name: 'hooks uninstall',
  summary: "Remove Mesa's hooks from Claude Code's user settings, and nothing else",
  example: 'mesa hooks uninstall',
  run: ({ mesa }) => {
    const recorded = mesa.hooks.uninstall();
    const { changed, ...status } = recorded.result;
    const said = changed ? `removed Mesa's hooks from ${status.path}` : 'no Mesa hooks to remove';
    const { receipt, text } = withReceipt(recorded, said);
    return { data: { ...status, changed, ...receipt }, text };
  },
});

/** Run by the agent's hooks, never by hand: appends the payload on stdin to the session's log. */
export const hook = defineCommand({
  name: 'hook',
  summary: 'Record an agent hook payload from stdin (run by the hooks mesa hooks install adds)',
  args: ['agent'],
  example: 'mesa hook claude < payload.json',
  run: async ({ mesa, args, stdin }) => {
    const event = mesa.hookEvent(args.agent, await stdin());
    return { data: { recorded: Boolean(event), event: event?.event ?? null }, text: '' };
  },
});
