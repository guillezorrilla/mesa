import * as hooks from '../hooks.js';
import { claudeSettings } from './paths.js';

/** The events Mesa listens to; PreToolUse only for AskUserQuestion. */
export const HOOK_EVENTS: readonly { event: string; matcher?: string }[] = [
  { event: 'SessionStart' },
  { event: 'UserPromptSubmit' },
  { event: 'PermissionRequest' },
  { event: 'PreToolUse', matcher: 'AskUserQuestion' },
  // The only hook between an approval or an answer and Stop (ADR-0003 amendment).
  { event: 'PostToolUse' },
  { event: 'Notification' },
  { event: 'Stop' },
  { event: 'SessionEnd' },
];

export type ClaudeHooksStatus = hooks.HookFileStatus;
const file = (home: string): hooks.HookFile => ({
  path: claudeSettings(home),
  agent: 'claude',
  events: HOOK_EVENTS,
});
export const hookCommand = (self: readonly string[]) => hooks.hookCommand(self, 'claude');
export const hooksStatus = (home: string, self: readonly string[]) =>
  hooks.hooksStatus(file(home), self);
export const installHooks = (home: string, self: readonly string[]) =>
  hooks.installHooks(file(home), self);
export const uninstallHooks = (home: string, self: readonly string[]) =>
  hooks.uninstallHooks(file(home), self);
