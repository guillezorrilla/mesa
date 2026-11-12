// A prompt an agent's pane waits on, as its agent's reader sees it (docs/spikes/prompt-answers.md):
// what it asks and which keys choose each answer. Each agent's reader is `AGENTS[agent].prompt`.

/** One answer a prompt offers, and the keys that choose it, pressed one by one. */
export type PromptChoice = {
  id: string;
  label: string;
  description?: string;
  keys: readonly string[];
};

/** A permission (run a tool) or a question (AskUserQuestion), with its answers. */
export type AgentPrompt = {
  kind: 'permission' | 'question';
  /** The tool a permission is for, as the agent names it. */
  tool?: string;
  /** The command, file, or question it asks about. */
  summary: string;
  options: PromptChoice[];
  /** The keys that open a typed answer, when the prompt takes one; the text and Enter follow. */
  freeText?: readonly string[];
};

/** The last hook event before the prompt, as the hook log keeps it (sessions/signals/hook-events.ts). */
export type PromptEvent = { at: string; event: string; payload: unknown };

/** A dialog is on screen now: its footer, which offers Esc to cancel, is the pane's last line. */
export const dialogShowing = (tail: string) =>
  /esc to cancel/i.test(tail.trimEnd().split('\n').at(-1) ?? '');

/** `payload[key]` when the payload is an object, else undefined. */
export const payloadField = (payload: unknown, key: string): unknown =>
  payload && typeof payload === 'object' ? (payload as Record<string, unknown>)[key] : undefined;

/** What a tool's input is about: its command, file, or address, else the tool's name. */
export function toolSummary(tool: string, input: unknown) {
  for (const key of ['command', 'file_path', 'path', 'url', 'pattern']) {
    const value = payloadField(input, key);
    if (typeof value === 'string' && value.trim()) return value;
  }
  return tool;
}
