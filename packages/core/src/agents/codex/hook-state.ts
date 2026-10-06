import type { AgentState } from '../states.js';

/** Embedded Codex hook states, measured in docs/spikes/codex.md. */
export function codexHookState(event: string): AgentState | undefined {
  switch (event) {
    case 'SessionStart':
    case 'Interrupt':
    case 'Stop':
      return 'idle';
    case 'UserPromptSubmit':
    case 'PostToolUse':
      return 'working';
    case 'PermissionRequest':
      return 'waiting-permission';
    case 'SessionEnd':
      return 'done';
    default:
      return undefined;
  }
}
