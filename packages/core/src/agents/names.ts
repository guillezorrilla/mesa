// The agents Mesa runs, by name and as a person reads each. Pure, so the app bundles it
// (@mesa/core/browser) for its New session dialog; what each one runs and reads is AGENTS
// (agents.ts).

export const AGENT_LABELS = {
  claude: 'Claude Code',
  codex: 'Codex',
  antigravity: 'Antigravity CLI',
} as const;

export type Agent = keyof typeof AGENT_LABELS;
export const AGENT_NAMES = Object.keys(AGENT_LABELS) as [Agent, ...Agent[]];
export const DEFAULT_AGENT: Agent = 'claude';
export const supportsPlanStart = (agent: Agent) => agent === 'claude' || agent === 'antigravity';
