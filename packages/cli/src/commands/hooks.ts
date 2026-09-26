import type { HooksStatus } from '@mesa/core';
import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

const listed = (s: HooksStatus) =>
  Object.entries(s.events)
    .map(([event, on]) => `${on ? 'ok  ' : 'MISS'} ${event}`)
    .join('\n');

export const hooksStatus = defineCommand({
  name: 'hooks status',
  summary:
    "Show which of Mesa's Claude Code hooks are in ~/.claude/settings.json, and its tmux pane-died hook",
  example: 'mesa hooks status',
  run: async ({ mesa }) => {
    const status = await mesa.hooks.status();
    const { socket, server, paneDied } = status.tmux;
    const tmux = server
      ? `${paneDied ? 'ok  ' : 'MISS'} tmux pane-died on ${socket}`
      : `--   tmux pane-died: no server on ${socket} yet`;
    return { data: status, text: `${status.path}\n${listed(status)}\n${tmux}` };
  },
});

export const hooksInstall = defineCommand({
  name: 'hooks install',
  summary: "Add Mesa's hooks to Claude Code's user settings; the user's own hooks stay as they are",
  example: 'mesa hooks install',
  run: ({ mesa }) => {
    const recorded = mesa.hooks.install();
    const { changed, ...status } = recorded.result;
    const text = changed ? `installed Mesa's hooks in ${status.path}` : 'hooks already installed';
    return recordedOutput(recorded, { data: { ...status, changed }, text });
  },
});

export const hooksUninstall = defineCommand({
  name: 'hooks uninstall',
  summary: "Remove Mesa's hooks from Claude Code's user settings, and nothing else",
  example: 'mesa hooks uninstall',
  run: ({ mesa }) => {
    const recorded = mesa.hooks.uninstall();
    const { changed, ...status } = recorded.result;
    const text = changed ? `removed Mesa's hooks from ${status.path}` : 'no Mesa hooks to remove';
    return recordedOutput(recorded, { data: { ...status, changed }, text });
  },
});
