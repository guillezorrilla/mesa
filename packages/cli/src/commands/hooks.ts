import type { HooksStatus } from '@mesa/core';
import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

const listed = (s: HooksStatus) =>
  Object.entries(s.events)
    .map(([event, on]) => `${on ? 'ok  ' : 'MISS'} ${event}`)
    .join('\n');

export const hooksStatus = defineCommand({
  name: 'hooks status',
  summary: "Show Mesa's Claude Code hooks, Codex hooks and trust, and tmux pane-died hook",
  example: 'mesa hooks status',
  run: async ({ mesa }) => {
    const status = await mesa.hooks.status();
    const { socket, server, paneDied } = status.tmux;
    const tmux = server
      ? `${paneDied ? 'ok  ' : 'MISS'} tmux pane-died on ${socket}`
      : `--   tmux pane-died: no server on ${socket} yet`;
    const codex = Object.entries(status.codex.events)
      .map(
        ([event, installed]) =>
          `${!installed ? 'MISS' : status.codex.trusted[event] ? 'TRUSTED' : 'UNTRUSTED'} ${event}`,
      )
      .join('\n');
    return {
      data: status,
      text: `${status.path}\n${listed(status)}\n${status.codex.path}\n${codex}\n${status.codex.hint}\n${tmux}`,
    };
  },
});

export const hooksInstall = defineCommand({
  name: 'hooks install',
  summary: "Add Mesa's Claude Code and Codex hooks; the user's own hooks stay as they are",
  example: 'mesa hooks install',
  run: ({ mesa }) => {
    const recorded = mesa.hooks.install();
    const { changed, ...status } = recorded.result;
    const text = changed
      ? `installed Mesa's hooks in ${status.path} and ${status.codex.path}`
      : 'hooks already installed';
    return recordedOutput(recorded, {
      data: { ...status, changed },
      text: `${text}\n${status.codex.hint}`,
    });
  },
});

export const hooksUninstall = defineCommand({
  name: 'hooks uninstall',
  summary: "Remove Mesa's Claude Code and Codex hooks, and nothing else",
  example: 'mesa hooks uninstall',
  run: ({ mesa }) => {
    const recorded = mesa.hooks.uninstall();
    const { changed, ...status } = recorded.result;
    const text = changed
      ? `removed Mesa's hooks from ${status.path} and ${status.codex.path}`
      : 'no Mesa hooks to remove';
    return recordedOutput(recorded, { data: { ...status, changed }, text });
  },
});
