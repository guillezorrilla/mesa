import { HOOKS_UPDATE_HINT, type HooksStatus } from '@mesa/core';
import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

const mark = (on: boolean) => (on ? 'ok  ' : 'MISS');
/** Antigravity's old mesa-vault and mesa-decisions entries, which install removes (ADR-0031). */
const mountLines = (m: HooksStatus['antigravityMounts']) =>
  m.conflict
    ? `${m.path}\nCONFLICT ${m.conflict}`
    : m.left
      ? `${m.path}\nOLD  mesa-vault and mesa-decisions entries: mesa hooks install removes them`
      : '--   no mesa-vault or mesa-decisions entries (sessions use the mesa CLI)';
/** Codex's rules file for Mesa's commands. */
const rulesLine = (codex: HooksStatus['codex']) =>
  `${mark(codex.rules)} Mesa's command rules in ${codex.rulesPath}`;
const listed = (s: HooksStatus) =>
  Object.entries(s.events)
    .map(([event, on]) => `${mark(on)} ${event}`)
    .join('\n');

export const hooksStatus = defineCommand({
  name: 'hooks status',
  summary:
    "Show Mesa's agent hooks, Codex trust and its rules for Mesa's commands, Antigravity's old MCP entries, and tmux pane-died hook",
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
      text: `${update}${status.path}\n${listed(status)}\n${status.codex.path}\n${codex}\n${rulesLine(status.codex)}\n${status.codex.hint}\n${status.antigravity.path}\n${mark(status.antigravity.installed)} PreInvocation\n${mountLines(status.antigravityMounts)}\n${tmux}`,
    };
  },
});

export const hooksInstall = defineCommand({
  name: 'hooks install',
  summary:
    "Add Mesa's agent hooks and Codex's rules for Mesa's commands, and remove Antigravity's old mesa-vault and mesa-decisions entries; the user's own stay as they are",
  example: 'mesa hooks install',
  run: ({ mesa }) => {
    const recorded = mesa.hooks.install();
    const { changed, ...status } = recorded.result;
    const text = changed
      ? `installed Mesa's hooks in ${status.path}, ${status.codex.path}, and ${status.antigravity.path}`
      : 'hooks already installed';
    return recordedOutput(recorded, {
      data: { ...status, changed },
      text: `${text}\n${status.codex.hint}`,
    });
  },
});

export const hooksUninstall = defineCommand({
  name: 'hooks uninstall',
  summary: "Remove Mesa's agent hooks, its Codex rules and old MCP entries, and nothing else",
  example: 'mesa hooks uninstall',
  run: ({ mesa }) => {
    const recorded = mesa.hooks.uninstall();
    const { changed, ...status } = recorded.result;
    const text = changed
      ? `removed Mesa's hooks from ${status.path}, ${status.codex.path}, and ${status.antigravity.path}`
      : 'no Mesa hooks to remove';
    return recordedOutput(recorded, { data: { ...status, changed }, text });
  },
});
