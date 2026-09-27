import { z } from 'zod';
import type { IdSource } from '../lib/ids.js';
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
import { codexHookState } from './codex/hook-state.js';
import { listCodexSessions } from './codex/listing.js';
import { codexSessionId } from './codex/rollouts.js';
import { codexLastOutputLine, codexScreenState } from './codex/screen.js';
import { AGENT_NAMES, type Agent } from './names.js';

/** A goal as the agent's first prompt: one shell word, so the shell hands it over byte for byte. */
const goalWord = (goal?: string) => (goal === undefined ? '' : ` ${shellWord(goal)}`);

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
 * On every codex Mesa starts or resumes. Any `-c` override keeps its TUI embedded, off a running
 * app-server daemon (docs/spikes/codex.md, ADR-0003 amendment), so the window's own environment
 * reaches its hooks and /exit ends it. A key under Mesa's name, which Codex reads nothing from.
 */
const CODEX_EMBEDDED = '-c mesa.embedded=true';

/**
 * The agents Mesa runs (their names and labels are names.ts), how to probe and install each, how
 * to start, resume, and quit one, type into it, and run one headless, and the readers of what a
 * running one writes and shows (its hooks, screen, listing, context use, transcripts, and
 * headless result), under agents/<agent>/. What an agent has none of yet is undefined. Sessions
 * reach an agent only through its entry here.
 */
export const AGENTS = {
  claude: {
    versionArgs: ['--version'],
    install: 'brew install --cask claude-code',
    /** None: claude takes the agent session id Mesa picks (newSessionId) with --session-id. */
    ownSessionId: undefined,
    /** The command a Mesa window runs, under the id Mesa chose, with the goal as the first prompt. */
    start: (sessionId: string, goal?: string) =>
      `claude --session-id ${sessionId}${goalWord(goal)}`,
    /** Reopens that conversation; run in the recorded project folder, which keys transcripts. */
    resume: (sessionId: string) => `claude --resume ${sessionId}`,
    /** Typed into the window to end the agent politely. */
    quit: '/exit',
    /** The pause between typed text and its Enter: none. */
    submitDelayMs: 0,
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
  codex: {
    versionArgs: ['--version'],
    install: 'brew install --cask codex',
    /** Codex picks its own thread id: a look at the board reads it from its rollouts. */
    ownSessionId: codexSessionId,
    /** The command a Mesa window runs; `--` so a goal such as `review` is a prompt, not a subcommand. */
    start: (goal?: string) =>
      `codex ${CODEX_EMBEDDED}${goal === undefined ? '' : ` --${goalWord(goal)}`}`,
    /** Reopens that thread in `folder`, the recorded one, which -C picks with no prompt. */
    resume: (sessionId: string, folder: string) =>
      `codex ${CODEX_EMBEDDED} resume ${shellWord(sessionId)} -C ${shellWord(folder)}`,
    quit: '/exit',
    /** An Enter right after the text can land as a newline in the composer (docs/spikes/codex.md). */
    submitDelayMs: 300,
    /** Headless Codex runs come with #160. */
    headless: undefined,
    /** Trusted hooks from the embedded Codex process. */
    hookState: codexHookState,
    screen: { state: codexScreenState, lastLine: codexLastOutputLine },
    /** Its sessions written in the last 10 minutes, whose rows say no state. */
    listing: { list: listCodexSessions, state: () => undefined },
    /** Not read for Codex yet: context use, and adoption. */
    context: undefined,
    transcripts: undefined,
  },
} as const satisfies Record<Agent, object>;

export const AgentSchema = z.enum(AGENT_NAMES);

/** An agent's entry. */
export type AgentSpec = (typeof AGENTS)[Agent];

/** An agent's binary, as doctor and a session's start probe it. */
export function agentBinary(name: Agent): Binary {
  return { name, args: AGENTS[name].versionArgs, role: 'agent', install: AGENTS[name].install };
}

/**
 * The agent session id a new session starts under: one Mesa picks, for an agent that takes it
 * (claude), or none yet, for one that picks its own (codex), read once it runs.
 */
export const newSessionId = (agent: Agent, newUuid: IdSource) =>
  AGENTS[agent].ownSessionId ? undefined : newUuid();

/**
 * A session's start command, its goal as the first prompt, under the agent session id Mesa
 * picked for it (newSessionId), which an agent that picks its own does not take.
 */
export function startCommand(agent: Agent, s: { agentSessionId?: string; goal?: string }) {
  const spec = AGENTS[agent];
  if (spec.ownSessionId) return spec.start(s.goal);
  if (s.agentSessionId === undefined) {
    throw new MesaError('internal', `${agent} starts under an agent session id Mesa picks`);
  }
  return spec.start(s.agentSessionId, s.goal);
}

/** The agent's entry once its binary answers; agent_unavailable otherwise, saying why and how to install it. */
export async function readyAgent(run: Runner, agent: Agent): Promise<AgentSpec> {
  const check = await probe(run, agentBinary(agent));
  if (!check.ok) throw new MesaError('agent_unavailable', `${agent} ${check.hint}`);
  return AGENTS[agent];
}
