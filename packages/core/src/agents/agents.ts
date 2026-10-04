import { z } from 'zod';
import type { IdSource } from '../lib/ids.js';
import { type Binary, probe } from '../lib/probe.js';
import { type Runner, shellWord } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import { antigravitySessionId, prepareAntigravityLog } from './antigravity/log.js';
import { readAntigravityResult } from './antigravity/result.js';
import { antigravityLastOutputLine, antigravityScreenState } from './antigravity/screen.js';
import { claudeContext } from './claude/context-use.js';
import { claudeHookState } from './claude/hook-state.js';
import { claudeListedState, listClaudeProcesses } from './claude/listing.js';
import { claudeTranscripts } from './claude/paths.js';
import { readClaudeResult } from './claude/result.js';
import { claudeLastOutputLine, claudeScreenState } from './claude/screen.js';
import { transcriptCwd } from './claude/transcripts.js';
import { codexContext } from './codex/context-use.js';
import { codexHookState } from './codex/hook-state.js';
import { listCodexSessions } from './codex/listing.js';
import { readCodexResult } from './codex/result.js';
import { codexSessionId } from './codex/rollouts.js';
import { codexLastOutputLine, codexScreenState } from './codex/screen.js';
import { type LaunchDefaults, launchFlags } from './launch-flags.js';
import { AGENT_EXECUTABLES, AGENT_NAMES, type Agent } from './names.js';
import {
  CLAUDE_VAULT_TOOLS,
  CLAUDE_VAULT_WRITES,
  CODEX_VAULT_READ_ONLY,
  claudeMcpConfig,
  claudeVaultArgs,
  codexVaultOverrides,
  type VaultServer,
} from './vault-mount.js';

/** A goal as the agent's first prompt: one shell word, so the shell hands it over byte for byte. */
const goalWord = (goal?: string) => (goal === undefined ? '' : ` ${shellWord(goal)}`);

/** The profile's launch defaults for `agent` as they follow its executable (launch-flags.ts). */
const flags = (agent: Agent, defaults: LaunchDefaults, mode?: 'plan') =>
  launchFlags(agent, defaults, mode)
    .map((flag) => ` ${flag}`)
    .join('');

/**
 * The extra folders an agent works in, an additional project's worktree each (CONTEXT.md,
 * Additional project): `--add-dir=<path>`, one shell word each (Claude Code, whose --add-dir takes
 * every word after it, and Antigravity CLI), or `--add-dir <path>` (Codex).
 */
const addDirs = (dirs: readonly string[], form: '=' | ' ' = '=') =>
  dirs
    .map((dir) =>
      form === '=' ? ` ${shellWord(`--add-dir=${dir}`)}` : ` --add-dir ${shellWord(dir)}`,
    )
    .join('');

/** Claude Code's mesa-vault mount as shell words (vault-mount.ts). */
const claudeMount = (server: VaultServer) => claudeVaultArgs(server).map(shellWord).join(' ');
/** Codex's mesa-vault mount as its four -c overrides (vault-mount.ts). */
const codexMount = (server: VaultServer) =>
  codexVaultOverrides(server)
    .map((override) => `-c ${shellWord(override)}`)
    .join(' ');

/**
 * How a headless run may act, from the profile's config `run` (CONTEXT.md, Profile), and with
 * `readOnlyVault`, without mesa-vault's write tools (a pipeline skill's run, whose output core lands).
 */
type HeadlessPermissions = {
  permissionMode: string;
  allowedTools: readonly string[];
  readOnlyVault?: boolean;
};

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
    /**
     * The command a Mesa window runs, under the id Mesa chose, with the profile's launch
     * defaults, mesa-vault mounted, the extra `dirs`, and the goal as the first prompt.
     */
    start: (
      sessionId: string,
      server: VaultServer,
      defaults: LaunchDefaults,
      goal?: string,
      mode?: 'plan',
      dirs: readonly string[] = [],
    ) =>
      `claude --session-id ${sessionId}${mode ? ' --permission-mode plan' : ''}${flags('claude', defaults, mode)} ${claudeMount(server)}${addDirs(dirs)}${goalWord(goal)}`,
    /**
     * Reopens that conversation; run in the recorded project folder, which keys transcripts. The
     * mount and the launch defaults are not part of the conversation, so they come again.
     */
    resume: (
      sessionId: string,
      _folder: string,
      server: VaultServer,
      defaults: LaunchDefaults,
      mode?: 'plan',
      dirs: readonly string[] = [],
    ) =>
      `claude --resume ${sessionId}${mode ? ' --permission-mode plan' : ''}${flags('claude', defaults, mode)} ${claudeMount(server)}${addDirs(dirs)}`,
    fork: (
      sessionId: string,
      _folder: string,
      server: VaultServer,
      defaults: LaunchDefaults,
      mode?: 'plan',
      dirs: readonly string[] = [],
    ) =>
      `claude --resume ${shellWord(sessionId)} --fork-session${mode ? ' --permission-mode plan' : ''}${flags('claude', defaults, mode)} ${claudeMount(server)}${addDirs(dirs)}`,
    /** Typed into the window to end the agent politely. */
    quit: '/exit',
    /** The pause between typed text and its Enter: none. */
    submitDelayMs: 0,
    /** A skill run with no one at its prompt (CONTEXT.md, Skill run). */
    headless: {
      skillPrefix: '/',
      /**
       * `prompt` through `claude -p`, its JSON result on stdout, in the conversation Mesa chose,
       * with the profile's permission mode, mesa-vault mounted, and its tools allowed before the
       * profile's own; a read-only run disallows its write tools, which wins over the allow. The
       * prompt and each tool are one shell word, as a rule such as `Bash(git log:*)` holds a
       * space; --allowedTools takes every word after it, so it comes last.
       */
      command: (
        sessionId: string | undefined,
        prompt: string,
        may: HeadlessPermissions,
        _folder: string,
        server: VaultServer,
      ) =>
        [
          'claude -p',
          shellWord(prompt),
          `--session-id ${sessionId} --output-format json`,
          `--permission-mode ${shellWord(may.permissionMode)}`,
          shellWord(claudeMcpConfig(server)),
          ...(may.readOnlyVault
            ? ['--disallowedTools', ...CLAUDE_VAULT_WRITES.map(shellWord)]
            : []),
          '--allowedTools',
          ...[CLAUDE_VAULT_TOOLS, ...may.allowedTools].map(shellWord),
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
    /**
     * The command a Mesa window runs, with mesa-vault mounted; `--` so a goal such as `review` is
     * a prompt, not a subcommand.
     */
    start: (
      server: VaultServer,
      defaults: LaunchDefaults,
      goal?: string,
      dirs: readonly string[] = [],
    ) =>
      `codex ${CODEX_EMBEDDED}${flags('codex', defaults)} ${codexMount(server)}${addDirs(dirs, ' ')}${goal === undefined ? '' : ` --${goalWord(goal)}`}`,
    /**
     * Reopens that thread in `folder`, the recorded one, which -C picks with no prompt. The mount
     * is not part of the thread, so it comes again.
     */
    resume: (
      sessionId: string,
      folder: string,
      server: VaultServer,
      defaults: LaunchDefaults,
      _mode?: 'plan',
      dirs: readonly string[] = [],
    ) =>
      `codex ${CODEX_EMBEDDED}${flags('codex', defaults)} ${codexMount(server)} resume ${shellWord(sessionId)} -C ${shellWord(folder)}${addDirs(dirs, ' ')}`,
    fork: (
      sessionId: string,
      folder: string,
      server: VaultServer,
      defaults: LaunchDefaults,
      _mode?: 'plan',
      dirs: readonly string[] = [],
    ) =>
      `codex ${CODEX_EMBEDDED}${flags('codex', defaults)} ${codexMount(server)} fork ${shellWord(sessionId)} -C ${shellWord(folder)}${addDirs(dirs, ' ')}`,
    quit: '/exit',
    /** An Enter right after the text can land as a newline in the composer (docs/spikes/codex.md). */
    submitDelayMs: 300,
    headless: {
      skillPrefix: '$',
      /** A read-only run turns mesa-vault's write tools off with the server's `disabled_tools`. */
      command: (
        _sessionId: string | undefined,
        prompt: string,
        may: HeadlessPermissions,
        folder: string,
        server: VaultServer,
      ) =>
        `codex exec --json -C ${shellWord(folder)} -c approval_policy=never -c sandbox_mode=workspace-write ${codexMount(server)}${may.readOnlyVault ? ` -c ${shellWord(CODEX_VAULT_READ_ONLY)}` : ''} ${shellWord(prompt)}`,
      result: readCodexResult,
    },
    /** Trusted hooks from the embedded Codex process. */
    hookState: codexHookState,
    screen: { state: codexScreenState, lastLine: codexLastOutputLine },
    /** Its sessions written in the last 10 minutes, whose rows say no state. */
    listing: { list: listCodexSessions, state: () => undefined },
    /** Last native per-turn token usage and context window from the exact rollout. */
    context: codexContext,
    transcripts: undefined,
  },
  antigravity: {
    versionArgs: ['--version'],
    install: 'https://antigravity.google/docs/cli/install/',
    /** The first prompt writes the native ID to this window's unique CLI log. */
    ownSessionId: antigravitySessionId,
    start: (
      goal: string | undefined,
      log: string,
      defaults: LaunchDefaults,
      mode?: 'plan',
      dirs: readonly string[] = [],
    ) =>
      `umask 077; exec agy --log-file ${shellWord(log)}${mode ? ' --mode=plan' : ''}${flags('antigravity', defaults, mode)}${addDirs(dirs)}${goal === undefined ? '' : ` --prompt-interactive ${shellWord(goal)}`}`,
    resume: (
      sessionId: string,
      log: string,
      defaults: LaunchDefaults,
      mode?: 'plan',
      dirs: readonly string[] = [],
    ) =>
      `umask 077; exec agy --log-file ${shellWord(log)} --conversation ${shellWord(sessionId)}${mode ? ' --mode=plan' : ''}${flags('antigravity', defaults, mode)}${addDirs(dirs)}`,
    quit: '/exit',
    submitDelayMs: 300,
    headless: {
      skillPrefix: '/',
      /**
       * No read-only run: agy mounts mesa-vault from its one global entry and takes no per-run
       * tool rule, so its write tools stay on (CONTEXT.md, Skill run).
       */
      command: (
        _sessionId: string | undefined,
        prompt: string,
        _may: HeadlessPermissions,
        log: string,
      ) => `agy --log-file ${shellWord(log)} --print ${shellWord(prompt)} --output-format json`,
      result: readAntigravityResult,
    },
    hookState: undefined,
    screen: { state: antigravityScreenState, lastLine: antigravityLastOutputLine },
    listing: { list: async () => [], state: () => undefined },
    context: undefined,
    transcripts: undefined,
  },
} as const satisfies Record<Agent, object>;

export const AgentSchema = z.enum(AGENT_NAMES);

/** An agent's entry. */
export type AgentSpec = (typeof AGENTS)[Agent];

/** An agent's binary, as doctor and a session's start probe it. */
export function agentBinary(name: Agent): Binary {
  return {
    name: AGENT_EXECUTABLES[name],
    args: AGENTS[name].versionArgs,
    role: 'agent',
    install: AGENTS[name].install,
  };
}

/**
 * The agent session id a new session starts under: one Mesa picks, for an agent that takes it
 * (claude), or none yet, for one that picks its own (codex), read once it runs.
 */
export const newSessionId = (agent: Agent, newUuid: IdSource) =>
  AGENTS[agent].ownSessionId ? undefined : newUuid();

/**
 * A session's start command, its goal as the first prompt, under the agent session id Mesa
 * picked for it (newSessionId), which an agent that picks its own does not take, with the
 * profile's launch `defaults`, `server` mounted for an agent that takes it per launch
 * (Antigravity's is global), and `dirs`, an additional project's worktree each, as extra folders
 * (sessions/additional.ts, additionalDirs).
 */
export function startCommand(
  agent: Agent,
  server: VaultServer,
  defaults: LaunchDefaults,
  s: {
    id?: string;
    logs?: string;
    agentSessionId?: string;
    goal?: string;
    mode?: 'plan';
  },
  dirs: readonly string[],
) {
  if (agent === 'antigravity') {
    if (!s.id || !s.logs) throw new MesaError('internal', 'agy needs a Mesa session log');
    const log = prepareAntigravityLog(s.logs, s.id);
    return AGENTS.antigravity.start(s.goal, log, defaults, s.mode, dirs);
  }
  if (agent === 'codex') return AGENTS.codex.start(server, defaults, s.goal, dirs);
  if (s.agentSessionId === undefined) {
    throw new MesaError('internal', `${agent} starts under an agent session id Mesa picks`);
  }
  return AGENTS.claude.start(s.agentSessionId, server, defaults, s.goal, s.mode, dirs);
}

/** The agent's entry once its binary answers; agent_unavailable otherwise, saying why and how to install it. */
export async function readyAgent(run: Runner, agent: Agent): Promise<AgentSpec> {
  const check = await probe(run, agentBinary(agent));
  if (!check.ok) throw new MesaError('agent_unavailable', `${agent} ${check.hint}`);
  return AGENTS[agent];
}
