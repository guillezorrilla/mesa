import { z } from 'zod';
import { type Binary, probe } from '../lib/probe.js';
import { type Runner, shellWord } from '../lib/process.js';

/** The agents Mesa runs and how to probe and install each. Everything agent-specific derives from here. */
export const AGENTS = {
  claude: {
    versionArgs: ['--version'],
    install: 'brew install --cask claude-code',
    /**
     * The command a Mesa window runs, with the agent session id Mesa chose and the goal, if any,
     * as claude's first prompt: one shell word, so the shell hands it over byte for byte.
     */
    start: (sessionId: string, goal?: string) =>
      `claude --session-id ${sessionId}${goal === undefined ? '' : ` ${shellWord(goal)}`}`,
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

/** An agent's binary, as doctor and a session's start probe it. */
export function agentBinary(name: Agent): Binary {
  return { name, args: AGENTS[name].versionArgs, role: 'agent', install: AGENTS[name].install };
}

/** One agent's probe: `hint` says why it failed and how to install it. */
export const checkAgent = (run: Runner, agent: Agent) => probe(run, agentBinary(agent));
