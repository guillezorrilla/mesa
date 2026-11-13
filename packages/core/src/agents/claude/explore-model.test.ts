import { expect, test } from 'vitest';
import { assistedAgent } from '../../testing/index.js';

// An Explore subagent started without a model runs on Haiku: Mesa's PreToolUse hook answers with
// the call's input and the model set, and approves nothing (docs/spikes/token-usage.md, Step 8).

const NATIVE_ID = '7d1e5a52-0b8c-4c43-9b7e-2f6a1c3d9e10';
const agentCall = (tool_input: object, tool_name = 'Agent') =>
  JSON.stringify({
    session_id: NATIVE_ID,
    hook_event_name: 'PreToolUse',
    tool_name,
    tool_input,
  });
const explore = {
  description: 'Find tide tables',
  prompt: 'Where is tideChart?',
  subagent_type: 'Explore',
};
const answer = (event: unknown) =>
  event && typeof event === 'object' && 'instruction' in event ? event.instruction : undefined;

test('an Explore call with no model is answered with the same input on haiku, and nothing approved', async () => {
  const { mesa } = await assistedAgent('claude', NATIVE_ID);
  const event = await mesa.hookEvent('claude', agentCall(explore));
  expect(JSON.parse(String(answer(event)))).toEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      updatedInput: { ...explore, model: 'haiku' },
    },
  });
});

test('a named model, another subagent, another tool or a question is left as it is', async () => {
  const { mesa } = await assistedAgent('claude', NATIVE_ID);
  for (const call of [
    agentCall({ ...explore, model: 'sonnet' }),
    agentCall({ ...explore, subagent_type: 'general-purpose' }),
    agentCall({ command: 'ls' }, 'Bash'),
    agentCall({ questions: [] }, 'AskUserQuestion'),
  ]) {
    const event = await mesa.hookEvent('claude', call);
    expect(event?.event).toBe('PreToolUse');
    expect(answer(event)).toBeUndefined();
  }
});
