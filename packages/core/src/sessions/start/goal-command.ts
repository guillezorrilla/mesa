// The `/goal` command a goal can open with (CONTEXT.md, Goal). Pure, so the app's preview and
// the Ticket starts read it the same way the start guard does.

// Claude Code refuses a longer /goal condition and starts no work (measured on 2.1.288: "Goal
// condition is limited to 4000 characters (got 4048)"); Codex caps its objectives the same.
export const MAX_GOAL_CONDITION = 4000;

/** The condition of a goal that opens with `/goal`: every line after it, trimmed; else undefined. */
export function goalCondition(goal: string): string | undefined {
  const command = goal.match(/^\/goal(?:\s([\s\S]*))?$/);
  return command ? (command[1] ?? '').trim() : undefined;
}
