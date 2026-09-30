import type { HooksStatus } from '@mesa/core';
import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

const mark = (on: boolean) => (on ? 'ok  ' : 'MISS');
/** Antigravity's mesa-vault entry and rule, or why Mesa leaves its files alone. */
const vaultLines = (vault: HooksStatus['antigravityVault']) =>
  vault.conflict
    ? `${vault.path}\nCONFLICT ${vault.conflict}`
    : `${vault.path}\n${mark(vault.server)} mesa-vault entry${vault.disabled ? ' (disabled in Antigravity)' : ''}\n${vault.rulePath}\n${mark(vault.rule)} mesa-vault allow rule`;
/** Where install or uninstall changed Antigravity's mesa-vault files; none when they conflict. */
const vaultFiles = (vault: HooksStatus['antigravityVault'], at: 'in' | 'from') =>
  vault.conflict ? '' : `, and its mesa-vault entry ${at} ${vault.path} and ${vault.rulePath}`;
const listed = (s: HooksStatus) =>
  Object.entries(s.events)
    .map(([event, on]) => `${mark(on)} ${event}`)
    .join('\n');

export const hooksStatus = defineCommand({
  name: 'hooks status',
  summary:
    "Show Mesa's agent hooks, Codex trust, Antigravity's mesa-vault entry, and tmux pane-died hook",
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
      text: `${status.path}\n${listed(status)}\n${status.codex.path}\n${codex}\n${status.codex.hint}\n${status.antigravity.path}\n${mark(status.antigravity.installed)} PreInvocation\n${vaultLines(status.antigravityVault)}\n${tmux}`,
    };
  },
});

export const hooksInstall = defineCommand({
  name: 'hooks install',
  summary:
    "Add Mesa's agent hooks and Antigravity's mesa-vault entry; the user's own stay as they are",
  example: 'mesa hooks install',
  run: ({ mesa }) => {
    const recorded = mesa.hooks.install();
    const { changed, ...status } = recorded.result;
    const text = changed
      ? `installed Mesa's hooks in ${status.path}, ${status.codex.path}, and ${status.antigravity.path}${vaultFiles(status.antigravityVault, 'in')}`
      : 'hooks already installed';
    return recordedOutput(recorded, {
      data: { ...status, changed },
      text: `${text}\n${status.codex.hint}`,
    });
  },
});

export const hooksUninstall = defineCommand({
  name: 'hooks uninstall',
  summary: "Remove Mesa's agent hooks and mesa-vault entry, and nothing else",
  example: 'mesa hooks uninstall',
  run: ({ mesa }) => {
    const recorded = mesa.hooks.uninstall();
    const { changed, ...status } = recorded.result;
    const text = changed
      ? `removed Mesa's hooks from ${status.path}, ${status.codex.path}, and ${status.antigravity.path}${vaultFiles(status.antigravityVault, 'from')}`
      : 'no Mesa hooks to remove';
    return recordedOutput(recorded, { data: { ...status, changed }, text });
  },
});
