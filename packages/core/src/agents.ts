import { z } from 'zod';

/** The agents Mesa runs and how to probe and install each. Everything agent-specific derives from here. */
export const AGENTS = {
  claude: {
    versionArgs: ['--version'],
    install: 'brew install --cask claude-code',
    /** The command a Mesa window runs, with the agent session id Mesa chose. */
    start: (sessionId: string) => `claude --session-id ${sessionId}`,
    /** Reopens that conversation; run in the recorded project folder, which keys transcripts. */
    resume: (sessionId: string) => `claude --resume ${sessionId}`,
    /** Typed into the window to end the agent politely. */
    quit: '/exit',
  },
  // v1 runs Claude Code only (ADR-0003 amendment).
  codex: {
    versionArgs: ['--version'],
    install: 'brew install --cask codex',
    planned: 'codex support is planned in #43',
  },
} as const;

export type Agent = keyof typeof AGENTS;
export const AGENT_NAMES = Object.keys(AGENTS) as [Agent, ...Agent[]];
export const DEFAULT_AGENT: Agent = 'claude';
export const AgentSchema = z.enum(AGENT_NAMES);
