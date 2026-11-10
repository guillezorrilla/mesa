import type { Env } from '../../lib/process.js';
import * as hooks from '../hooks.js';
import { claudeSettings } from './paths.js';

/**
 * The events Mesa listens to; PreToolUse only for AskUserQuestion. Those that only log run async,
 * so the agent never waits on them (#894); PermissionRequest blocks on a person anyway, and
 * SessionEnd must finish before Claude exits.
 */
export const HOOK_EVENTS: hooks.HookFile['events'] = [
  { event: 'SessionStart' },
  { event: 'UserPromptSubmit' },
  { event: 'PermissionRequest' },
  { event: 'PreToolUse', matcher: 'AskUserQuestion' },
  // The only hook between an approval or an answer and Stop (ADR-0003 amendment).
  { event: 'PostToolUse', async: true },
  { event: 'Notification', async: true },
  { event: 'SubagentStart', async: true },
  { event: 'SubagentStop', async: true },
  { event: 'Stop' },
  { event: 'SessionEnd' },
];

export type ClaudeHooksStatus = hooks.HookFileStatus;
const file = (home: string, env: Env): hooks.HookFile => ({
  path: claudeSettings(home, env),
  agent: 'claude',
  events: HOOK_EVENTS,
});
export const hookCommand = (self: readonly string[], event?: string) =>
  hooks.hookCommand(self, 'claude', event);
export const hooksStatus = (home: string, env: Env, self: readonly string[]) =>
  hooks.hooksStatus(file(home, env), self);
export const installHooks = (home: string, env: Env, self: readonly string[]) =>
  hooks.installHooks(file(home, env), self);
export const uninstallHooks = (home: string, env: Env, self: readonly string[]) =>
  hooks.uninstallHooks(file(home, env), self);
