import {
  type AgentPrompt,
  dialogShowing,
  type PromptEvent,
  payloadField,
  toolSummary,
} from '../prompt.js';

// Claude Code's permission dialog and AskUserQuestion, as qualified live in
// docs/spikes/prompt-answers.md: a digit picks a numbered answer at once, Esc denies.

/** One question with single-choice answers, from AskUserQuestion's input; else undefined. */
function question(input: unknown, tail: string): AgentPrompt | undefined {
  const questions = payloadField(input, 'questions');
  if (!Array.isArray(questions) || questions.length !== 1) return undefined;
  const [asked] = questions;
  const text = payloadField(asked, 'question');
  const options = payloadField(asked, 'options');
  if (payloadField(asked, 'multiSelect') === true || typeof text !== 'string') return undefined;
  if (!Array.isArray(options) || !options.length || options.length > 8) return undefined;
  const labels = options.map((o) => payloadField(o, 'label'));
  if (!labels.every((l): l is string => typeof l === 'string')) return undefined;
  // The pane shows this question's answers, not another's.
  if (!tail.includes(`1. ${labels[0]}`)) return undefined;
  const typed = String(options.length + 1);
  return {
    kind: 'question',
    tool: 'AskUserQuestion',
    summary: text,
    options: labels.map((label, i) => {
      const description = payloadField(options[i], 'description');
      return {
        id: String(i + 1),
        label,
        ...(typeof description === 'string' && description ? { description } : {}),
        keys: [String(i + 1)],
      };
    }),
    ...(tail.includes(`${typed}. Type something`) ? { freeText: [typed] } : {}),
  };
}

/**
 * The prompt Claude Code's pane shows, read from the hook event that opened it and the pane's
 * tail; undefined for one it does not qualify (several questions, a multi-choice question, plan
 * approval, folder trust, or no hook event).
 */
export function claudePrompt(tail: string, event?: PromptEvent): AgentPrompt | undefined {
  if (!event || !dialogShowing(tail)) return undefined;
  const tool = payloadField(event.payload, 'tool_name');
  const input = payloadField(event.payload, 'tool_input');
  if (typeof tool !== 'string') return undefined;
  if (tool === 'AskUserQuestion') return question(input, tail);
  if (event.event !== 'PermissionRequest') return undefined;
  // "Do you want to proceed?" with a plain "1. Yes" first; "No" is the last, whatever their count.
  if (!/do you want/i.test(tail) || !/^\s*(?:❯\s*)?1\. Yes\s*$/m.test(tail)) return undefined;
  return {
    kind: 'permission',
    tool,
    summary: toolSummary(tool, input),
    options: [
      { id: 'allow', label: 'Allow', keys: ['1'] },
      { id: 'deny', label: 'Deny', keys: ['Escape'] },
    ],
  };
}
