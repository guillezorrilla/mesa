import type { Agent } from '../agents/names.js';

export type BuiltinCommand = { name: string; description: string; argumentHint?: string };

// Neither CLI lists its commands at rest, so these are curated per agent (as orca's
// native-chat-slash-commands does); a command a newer CLI adds shows once this table does.

const CLAUDE: BuiltinCommand[] = [
  { name: 'add-dir', description: 'Add a working directory', argumentHint: '<path>' },
  { name: 'agents', description: 'Manage subagents' },
  { name: 'clear', description: 'Clear the conversation and start fresh' },
  {
    name: 'compact',
    description: 'Summarize the conversation to free context',
    argumentHint: '[instructions]',
  },
  { name: 'config', description: 'Open settings' },
  { name: 'context', description: 'Show what fills the context window' },
  { name: 'cost', description: 'Show token usage and cost' },
  { name: 'doctor', description: 'Check the installation' },
  { name: 'export', description: 'Export the conversation', argumentHint: '[filename]' },
  { name: 'help', description: 'Show help and available commands' },
  { name: 'hooks', description: 'Manage hooks' },
  { name: 'init', description: 'Create a CLAUDE.md for this project' },
  { name: 'mcp', description: 'Manage MCP servers' },
  { name: 'memory', description: 'Edit memory files' },
  { name: 'model', description: 'Choose the model', argumentHint: '[model]' },
  { name: 'permissions', description: 'Manage tool permissions' },
  { name: 'resume', description: 'Resume an earlier conversation', argumentHint: '[session]' },
  { name: 'review', description: 'Review a pull request', argumentHint: '[pr]' },
  { name: 'status', description: 'Show version, model and account status' },
  { name: 'usage', description: 'Show plan usage and limits' },
];

const CODEX: BuiltinCommand[] = [
  { name: 'approvals', description: 'Choose what Codex may do without asking' },
  { name: 'compact', description: 'Summarize the conversation to free context' },
  { name: 'diff', description: 'Show the git diff, including untracked files' },
  { name: 'init', description: 'Create an AGENTS.md for this project' },
  { name: 'mcp', description: 'List configured MCP tools' },
  { name: 'mention', description: 'Attach a file to the conversation', argumentHint: '<path>' },
  { name: 'model', description: 'Choose the model and reasoning effort' },
  { name: 'new', description: 'Start a new conversation' },
  { name: 'quit', description: 'Exit Codex' },
  { name: 'review', description: 'Review the working tree', argumentHint: '[instructions]' },
  { name: 'status', description: 'Show the session configuration and token usage' },
];

/** Antigravity's own are not known yet: it lists none rather than guessing. */
export const builtinCommands = (agent: Agent): BuiltinCommand[] =>
  agent === 'claude' ? CLAUDE : agent === 'codex' ? CODEX : [];
