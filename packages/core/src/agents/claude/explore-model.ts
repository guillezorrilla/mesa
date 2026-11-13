/** The model an Explore subagent runs on when its Agent call names none. */
export const EXPLORE_MODEL = 'haiku';

/**
 * A PreToolUse hook's JSON output that runs an Explore subagent on EXPLORE_MODEL when its Agent
 * call names no model; else undefined. Explore otherwise runs on the session's own model, and the
 * start pointer's advice to ask for Haiku went unheeded (docs/spikes/token-usage.md, Step 8).
 * It sets no permission decision, so it approves nothing; `payload` is the hook's raw stdin, since
 * the logged one is cut.
 */
export function exploreOnHaiku(payload: string): string | undefined {
  let call: { tool_name?: unknown; tool_input?: Record<string, unknown> };
  try {
    call = JSON.parse(payload);
  } catch {
    return undefined;
  }
  const input = call?.tool_input;
  if (call?.tool_name !== 'Agent' || input?.subagent_type !== 'Explore' || input.model)
    return undefined;
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      updatedInput: { ...input, model: EXPLORE_MODEL },
    },
  });
}
