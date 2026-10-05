import type { HooksStatus } from '@mesa/core';
import { AGENT_LABELS } from '@mesa/core/browser';

/** Each agent's label and whether Mesa's hooks are in it and current. */
export const hookAgents = (status: HooksStatus) =>
  [
    [AGENT_LABELS.claude, status.installed && !status.stale],
    [AGENT_LABELS.codex, status.codex.installed && !status.codex.stale],
    [AGENT_LABELS.antigravity, status.antigravity.installed && !status.antigravity.stale],
  ] as const;

/** Mesa's hooks are in every agent and current. */
export const hooksReady = (status: HooksStatus | undefined) =>
  !!status && hookAgents(status).every(([, installed]) => installed);
