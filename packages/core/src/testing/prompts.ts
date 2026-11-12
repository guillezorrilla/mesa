import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { profilePaths } from '../profile/paths.js';

/** A Claude Code pane showing a prompt, from the reader's fixtures (`bash`, `question`, ...). */
export const claudePromptPane = (name: string) =>
  readFileSync(new URL(`../agents/claude/fixtures/prompts/${name}.txt`, import.meta.url), 'utf8');

/** Logs a hook event for session `id`, as its agent's hook would, so a prompt reader sees it. */
export function plantHookEvent(
  home: string,
  hook: { session: string; agent: string; at: string; event: string; payload: object },
  profile = 'default',
) {
  const events = profilePaths(home, profile).events;
  mkdirSync(events, { recursive: true });
  const { session, ...rest } = hook;
  const line = { at: rest.at, agent: rest.agent, event: rest.event, mesaSessionId: session };
  appendFileSync(
    join(events, `${session}.jsonl`),
    `${JSON.stringify({ ...line, payload: rest.payload })}\n`,
  );
}
