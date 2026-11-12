import {
  type AgentPrompt,
  dialogShowing,
  type PromptEvent,
  payloadField,
  toolSummary,
} from '../prompt.js';

// Codex's approval dialog for a command or an edit, as qualified live in
// docs/spikes/prompt-answers.md: `y` approves once, Esc denies.

/** What the dialog is about, from its own lines: the `$ command`, or the edit's destination. */
const paneSummary = (tail: string) =>
  /^\s*\$ (.+)$/m.exec(tail)?.[1]?.trim() ?? /^\s*Destination: (.+)$/m.exec(tail)?.[1]?.trim();

/**
 * The approval Codex's pane shows, about the tool its PermissionRequest hook names when one was
 * logged, else what the dialog says; undefined for any other screen.
 */
export function codexPrompt(tail: string, event?: PromptEvent): AgentPrompt | undefined {
  if (!dialogShowing(tail)) return undefined;
  const command = /would you like to run the following command\?/i.test(tail);
  if (!command && !/would you like to make the following edits\?/i.test(tail)) return undefined;
  if (!/^\s*(?:›\s*)?1\. Yes, proceed \(y\)\s*$/m.test(tail)) return undefined;
  const hooked = event?.event === 'PermissionRequest' ? event.payload : undefined;
  const named = payloadField(hooked, 'tool_name');
  const tool = typeof named === 'string' ? named : command ? 'Bash' : 'apply_patch';
  const summary = hooked
    ? toolSummary(tool, payloadField(hooked, 'tool_input'))
    : (paneSummary(tail) ?? tool);
  return {
    kind: 'permission',
    tool,
    summary,
    options: [
      { id: 'allow', label: 'Allow', keys: ['y'] },
      { id: 'deny', label: 'Deny', keys: ['Escape'] },
    ],
  };
}
