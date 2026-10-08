import { HOOKS_UPDATE_HINT, type HooksStatus } from '@mesa/core';
import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

const mark = (on: boolean) => (on ? 'ok  ' : 'MISS');
/** Antigravity's entry and rule for one of Mesa's servers, or why Mesa leaves its files alone. */
const vaultLines = (vault: HooksStatus['antigravityVault'], name = 'mesa-vault') =>
  vault.conflict
    ? `${vault.path}\nCONFLICT ${vault.conflict}`
    : `${vault.path}\n${mark(vault.server)} ${name} entry${vault.disabled ? ' (disabled in Antigravity)' : ''}\n${vault.rulePath}\n${mark(vault.rule)} ${name} allow rule`;
/** Antigravity's mesa-decisions entry and rule, which only a profile with a Decision model wants. */
const decisionsLines = (decisions: HooksStatus['antigravityDecisions']) =>
  decisions.wanted || decisions.server || decisions.conflict
    ? vaultLines(decisions, 'mesa-decisions')
    : '--   mesa-decisions entry: none without a Decision model';
/** Where install or uninstall changed Antigravity's MCP files; none when they conflict. */
const vaultFiles = (
  s: Pick<HooksStatus, 'antigravityVault' | 'antigravityDecisions'>,
  at: 'in' | 'from',
) => {
  const names = [
    ...(s.antigravityVault.conflict ? [] : ['mesa-vault']),
    ...(s.antigravityDecisions.conflict || (at === 'in' && !s.antigravityDecisions.wanted)
      ? []
      : ['mesa-decisions']),
  ];
  return names.length
    ? `, and its ${names.join(' and ')} entries ${at} ${s.antigravityVault.path} and ${s.antigravityVault.rulePath}`
    : '';
};
const listed = (s: HooksStatus) =>
  Object.entries(s.events)
    .map(([event, on]) => `${mark(on)} ${event}`)
    .join('\n');

export const hooksStatus = defineCommand({
  name: 'hooks status',
  summary:
    "Show Mesa's agent hooks, Codex trust, Antigravity's mesa-vault and mesa-decisions entries, and tmux pane-died hook",
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
    // Hooks Mesa installed once that an install would now change (#678).
    const update = status.needsUpdate ? `${HOOKS_UPDATE_HINT}\n` : '';
    return {
      data: status,
      text: `${update}${status.path}\n${listed(status)}\n${status.codex.path}\n${codex}\n${status.codex.hint}\n${status.antigravity.path}\n${mark(status.antigravity.installed)} PreInvocation\n${vaultLines(status.antigravityVault)}\n${decisionsLines(status.antigravityDecisions)}\n${tmux}`,
    };
  },
});

export const hooksInstall = defineCommand({
  name: 'hooks install',
  summary:
    "Add Mesa's agent hooks and Antigravity's mesa-vault entry, and its mesa-decisions entry with a Decision model; the user's own stay as they are",
  example: 'mesa hooks install',
  run: ({ mesa }) => {
    const recorded = mesa.hooks.install();
    const { changed, ...status } = recorded.result;
    const text = changed
      ? `installed Mesa's hooks in ${status.path}, ${status.codex.path}, and ${status.antigravity.path}${vaultFiles(status, 'in')}`
      : 'hooks already installed';
    return recordedOutput(recorded, {
      data: { ...status, changed },
      text: `${text}\n${status.codex.hint}`,
    });
  },
});

export const hooksUninstall = defineCommand({
  name: 'hooks uninstall',
  summary: "Remove Mesa's agent hooks and MCP entries, and nothing else",
  example: 'mesa hooks uninstall',
  run: ({ mesa }) => {
    const recorded = mesa.hooks.uninstall();
    const { changed, ...status } = recorded.result;
    const text = changed
      ? `removed Mesa's hooks from ${status.path}, ${status.codex.path}, and ${status.antigravity.path}${vaultFiles(status, 'from')}`
      : 'no Mesa hooks to remove';
    return recordedOutput(recorded, { data: { ...status, changed }, text });
  },
});
