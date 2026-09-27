import { z } from 'zod';
import { type Binary, probe } from '../lib/probe.js';
import { type Runner, shellWord } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import { claudeContext } from './claude/context-use.js';
import { claudeHookState } from './claude/hook-state.js';
import { claudeListedState, listClaudeProcesses } from './claude/listing.js';
import { claudeTranscripts } from './claude/paths.js';
import { readClaudeResult } from './claude/result.js';
import { claudeLastOutputLine, claudeScreenState } from './claude/screen.js';
import { transcriptCwd } from './claude/transcripts.js';

/** The permission modes `claude -p --permission-mode` takes (Claude Code 2.1.283). */
export const CLAUDE_PERMISSION_MODES = [
  'acceptEdits',
  'auto',
  'bypassPermissions',
  'manual',
  'dontAsk',
  'plan',
] as const;

/** How a headless run may act, from the profile's config `run` (CONTEXT.md, Profile). */
type HeadlessPermissions = { permissionMode: string; allowedTools: readonly string[] };

/**
 * The agents Mesa runs, how to probe and install each, how to start, resume, quit, and run one
 * headless, and the readers of what a running one writes and shows (its hooks, screen, listing,
 * context use, transcripts, and headless result), under agents/<agent>/. Sessions reach an agent
 * only through its entry here.
 */
export const AGENTS = {
  claude: {
    label: 'Claude Code',
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
    /** A skill run with no one at its prompt (CONTEXT.md, Skill run). */
    headless: {
      /**
       * `prompt` through `claude -p`, its JSON result on stdout, in the conversation Mesa chose,
       * with the profile's permission mode and allowed tools (none: the mode's own). The prompt
       * and each tool are one shell word, as a rule such as `Bash(git log:*)` holds a space;
       * --allowedTools takes every word after it, so it comes last.
       */
      command: (sessionId: string, prompt: string, may: HeadlessPermissions) =>
        [
          'claude -p',
          shellWord(prompt),
          `--session-id ${sessionId} --output-format json`,
          `--permission-mode ${shellWord(may.permissionMode)}`,
          ...(may.allowedTools.length
            ? ['--allowedTools', ...may.allowedTools.map(shellWord)]
            : []),
        ].join(' '),
      /** What its stdout says: the result, or why there is none. */
      result: readClaudeResult,
    },
    /** The session state a hook event means, if any. */
    hookState: claudeHookState,
    /** Its pane's screen: the state it shows, and the board's last output line. */
    screen: { state: claudeScreenState, lastLine: claudeLastOutputLine },
    /** Its live sessions on the machine, and the state each listed status means. */
    listing: { list: listClaudeProcesses, state: claudeListedState },
    /** A session's context use, from its transcript. */
    context: claudeContext,
    /** Where its transcripts are, and the folder a conversation ran in (adoption). */
    transcripts: {
      dir: claudeTranscripts,
      cwdOf: (home: string, id: string) => transcriptCwd(claudeTranscripts(home), id),
    },
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
const checkAgent = (run: Runner, agent: Agent) => probe(run, agentBinary(agent));

/** An agent Mesa can run: it starts and resumes sessions, and has readers (v1: claude). */
export type RunnableName = {
  [K in Agent]: (typeof AGENTS)[K] extends { start: unknown } ? K : never;
}[Agent];
type RunnableAgent = (typeof AGENTS)[RunnableName];

/** The agent's entry when Mesa can run it; undefined for one only planned, which reads nothing. */
export const runnableAgent = (agent: Agent): RunnableAgent | undefined => {
  const spec = AGENTS[agent];
  return 'start' in spec ? spec : undefined;
};
/** Every agent Mesa can run. */
export const RUNNABLE_AGENTS = AGENT_NAMES.filter((a): a is RunnableName => !!runnableAgent(a));

/**
 * The agent's spec, once Mesa can run it and its binary answers; agent_unavailable otherwise,
 * saying why and how to install it.
 */
export async function readyAgent(run: Runner, agent: Agent): Promise<RunnableAgent> {
  const spec = AGENTS[agent];
  if (!('start' in spec)) throw new MesaError('agent_unavailable', spec.planned);
  const check = await checkAgent(run, agent);
  if (!check.ok) throw new MesaError('agent_unavailable', `${agent} ${check.hint}`);
  return spec;
}
