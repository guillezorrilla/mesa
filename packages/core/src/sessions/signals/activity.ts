import { type HookEvent, parentHook } from './hook-events.js';

// What a working session is doing, read from the hook log it already keeps (ADR-0003): no new
// hook. The Office draws it (CONTEXT.md, Office).

export const ACTIVITY_KINDS = [
  'writing',
  'reading',
  'running',
  'searching',
  'delegating',
  'thinking',
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** What its main agent last did this turn: the kind of work, and the tool when there was one. */
export type Activity = { kind: ActivityKind; tool?: string; at: string };

/** A subagent its main agent started that has not stopped. */
export type Subagent = { id: string; type?: string; since: string };

const KINDS: readonly [RegExp, ActivityKind][] = [
  [/^(Edit|MultiEdit|Write|NotebookEdit|apply_patch)$/, 'writing'],
  [/^(Read|Grep|Glob|LS|ToolSearch)$/, 'reading'],
  [/^(WebSearch|WebFetch)$/, 'searching'],
  [/^(Agent|Task|Workflow)$/, 'delegating'],
];

const field = (payload: unknown, key: string) => {
  const value = (payload as Record<string, unknown> | null)?.[key];
  return typeof value === 'string' && value ? value : undefined;
};

/** The kind of work a tool is; one this table does not name runs something. */
export const activityKind = (tool: string): ActivityKind =>
  KINDS.find(([names]) => names.test(tool))?.[1] ?? 'running';

/**
 * What `events` (oldest first) say the main agent last did: its newest tool call's kind, or
 * thinking when a prompt came after it; none before any prompt or tool call. A subagent's own tool
 * calls are not the main agent's.
 */
export function sessionActivity(events: readonly HookEvent[]): Activity | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i] as HookEvent;
    if (!parentHook(event)) continue;
    if (event.event === 'UserPromptSubmit') return { kind: 'thinking', at: event.at };
    const tool = /^(Pre|Post)ToolUse$/.test(event.event) && field(event.payload, 'tool_name');
    if (tool) return { kind: activityKind(tool), tool, at: event.at };
  }
  return undefined;
}

/**
 * The subagents `events` (oldest first) leave running: each SubagentStart no SubagentStop
 * answered, oldest first. A new or ended agent session leaves none: its subagents went with it.
 */
export function openSubagents(events: readonly HookEvent[]): Subagent[] {
  const open = new Map<string, Subagent>();
  for (const event of events) {
    if (event.event === 'SessionStart' || event.event === 'SessionEnd') open.clear();
    const id = field(event.payload, 'agent_id');
    if (!id) continue;
    if (event.event === 'SubagentStop') open.delete(id);
    if (event.event !== 'SubagentStart') continue;
    const type = field(event.payload, 'agent_type');
    open.set(id, { id, ...(type ? { type } : {}), since: event.at });
  }
  return [...open.values()];
}
