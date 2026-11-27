import { expect, test } from 'vitest';
import { activityKind, openSubagents, sessionActivity } from './activity.js';
import type { HookEvent } from './hook-events.js';

const hook = (time: string, event: string, payload: object = {}): HookEvent => ({
  at: `2026-09-24T${time}.000Z`,
  agent: 'claude',
  event,
  payload,
});

test('a tool is the kind of work it does, and an unknown one runs something', () => {
  expect(
    ['Edit', 'Read', 'WebSearch', 'Agent', 'Bash', 'mcp__tide__chart'].map(activityKind),
  ).toEqual(['writing', 'reading', 'searching', 'delegating', 'running', 'running']);
});

test('activity is the main agent newest tool call, thinking after a newer prompt, none before either', () => {
  expect(sessionActivity([hook('12:00:00', 'SessionStart')])).toBeUndefined();
  const turn = [
    hook('12:00:01', 'UserPromptSubmit'),
    hook('12:00:02', 'PostToolUse', { tool_name: 'Read' }),
    hook('12:00:03', 'PostToolUse', { tool_name: 'Edit' }),
    // A subagent's tool call is not the main agent's.
    hook('12:00:04', 'PostToolUse', { tool_name: 'Bash', agent_id: 'agent-lantern' }),
  ];
  expect(sessionActivity(turn)).toEqual({
    kind: 'writing',
    tool: 'Edit',
    at: '2026-09-24T12:00:03.000Z',
  });
  expect(sessionActivity([...turn, hook('12:00:05', 'UserPromptSubmit')])).toEqual({
    kind: 'thinking',
    at: '2026-09-24T12:00:05.000Z',
  });
});

test('open subagents are the starts no stop answered, and a new agent session leaves none', () => {
  const events = [
    hook('12:00:01', 'SubagentStart', { agent_id: 'agent-lantern', agent_type: 'Explore' }),
    hook('12:00:02', 'SubagentStart', { agent_id: 'agent-tide', agent_type: '' }),
    hook('12:00:03', 'SubagentStop', { agent_id: 'agent-lantern', agent_type: 'Explore' }),
  ];
  expect(openSubagents(events)).toEqual([{ id: 'agent-tide', since: '2026-09-24T12:00:02.000Z' }]);
  expect(openSubagents([...events, hook('12:00:04', 'SessionStart')])).toEqual([]);
});
