import { z } from 'zod';

/** The agents Mesa runs and how to probe and install each. Everything agent-specific derives from here. */
export const AGENTS = {
  claude: { versionArgs: ['--version'], install: 'brew install --cask claude-code' },
  codex: { versionArgs: ['--version'], install: 'brew install --cask codex' },
} as const;

export type Agent = keyof typeof AGENTS;
export const AGENT_NAMES = Object.keys(AGENTS) as [Agent, ...Agent[]];
export const DEFAULT_AGENT: Agent = 'claude';
export const AgentSchema = z.enum(AGENT_NAMES);
