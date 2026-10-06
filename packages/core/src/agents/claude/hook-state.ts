import type { AgentState } from '../states.js';

// What Claude Code's hook events mean as a session state (docs/spikes/state-signals.md).

const field = (payload: unknown, key: string) =>
  payload && typeof payload === 'object' && key in payload
    ? String((payload as Record<string, unknown>)[key])
    : undefined;

/** The state a Claude Code hook event means, or none for one that says nothing. */
export function claudeHookState(event: string, payload?: unknown): AgentState | undefined {
  const question = field(payload, 'tool_name') === 'AskUserQuestion';
  switch (event) {
    case 'SessionStart':
    case 'Stop':
      return 'idle';
    case 'UserPromptSubmit':
    case 'PostToolUse':
      return 'working';
    case 'PermissionRequest':
      return question ? 'waiting-question' : 'waiting-permission';
    case 'PreToolUse':
      return question ? 'waiting-question' : undefined;
    case 'Notification':
      return field(payload, 'notification_type') === 'idle_prompt' ? 'idle' : undefined;
    case 'SessionEnd':
      // /clear and /resume start another conversation in the same agent, which goes on.
      return ['clear', 'resume'].includes(field(payload, 'reason') ?? '') ? undefined : 'done';
    case 'StopFailure':
      return 'failed';
    default:
      return undefined;
  }
}
