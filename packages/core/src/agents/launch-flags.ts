import { z } from 'zod';
import { MesaError } from '../lib/result.js';
import {
  type Agent,
  ANTIGRAVITY_MODES,
  CODEX_APPROVAL_POLICIES,
  CODEX_SANDBOXES,
} from './names.js';

/**
 * Each agent's native launch defaults (the profile config's `agents`), in that agent's own terms
 * and never translated between agents. Unset uses the agent's native config and emits nothing.
 */
export const LaunchDefaultsSchema = z
  .strictObject({
    claude: z.strictObject({ skipPermissions: z.boolean().optional() }).prefault({}),
    codex: z
      .strictObject({
        approvalPolicy: z.enum(CODEX_APPROVAL_POLICIES).optional(),
        sandbox: z.enum(CODEX_SANDBOXES).optional(),
        bypass: z.boolean().optional(),
      })
      .prefault({}),
    antigravity: z
      .strictObject({
        skipPermissions: z.boolean().optional(),
        mode: z.enum(ANTIGRAVITY_MODES).optional(),
        sandbox: z.boolean().optional(),
      })
      .prefault({}),
  })
  .prefault({});

export type LaunchDefaults = z.infer<typeof LaunchDefaultsSchema>;

/** A session's own model and effort (`mesa open --model --effort`), over the profile's defaults. */
export type SessionModel = { model?: string; effort?: string };
/** What a session starts with: the profile's launch defaults and its own model and effort. */
export type SessionLaunch = LaunchDefaults & SessionModel;

/** The effort levels each agent takes: Claude Code's --effort, Codex's model_reasoning_effort. */
const EFFORTS = {
  claude: ['low', 'medium', 'high', 'xhigh', 'max'],
  codex: ['minimal', 'low', 'medium', 'high', 'xhigh'],
} as const;

/**
 * Refuses, as usage, a model or effort `agent` cannot start with: Antigravity takes neither, a
 * model is one name, and an effort one of the agent's levels.
 */
export function requireSessionModel(agent: Agent | 'terminal', { model, effort }: SessionModel) {
  if (model === undefined && effort === undefined) return;
  if (agent !== 'claude' && agent !== 'codex')
    throw new MesaError('usage', `${agent} takes no --model or --effort`);
  if (model !== undefined && !/^[\w.:/@[\]-]+$/.test(model))
    throw new MesaError('usage', `--model is one model name, not ${JSON.stringify(model)}`);
  const levels: readonly string[] = EFFORTS[agent];
  if (effort !== undefined && !levels.includes(effort))
    throw new MesaError('usage', `${agent} --effort is one of ${levels.join(', ')}, not ${effort}`);
}

/** A session's own model and effort as `agent`'s arguments, one word each; none when unset. */
const modelArgs = (agent: Agent, { model, effort }: SessionModel): string[] =>
  agent === 'claude'
    ? [...(model ? ['--model', model] : []), ...(effort ? ['--effort', effort] : [])]
    : agent === 'codex'
      ? [
          ...(model ? ['-m', model] : []),
          ...(effort ? ['-c', `model_reasoning_effort=${effort}`] : []),
        ]
      : [];

/** The flags that turn off an agent's own permission checks or sandbox. */
const DANGEROUS = new Set([
  '--dangerously-skip-permissions',
  '--dangerously-bypass-approvals-and-sandbox',
  '--sandbox=danger-full-access',
]);

/**
 * The flags a new or resumed session of `agent` starts with, one argument each, from the
 * profile's launch defaults and the session's own model and effort. A session in plan keeps plan: a configured mode gives way (Claude's
 * skip permissions is its bypassPermissions mode). Codex's bypass already means no approvals and
 * no sandbox, so it is the only flag Codex then gets. A Codex session with extra folders, `dirs`,
 * runs workspace-write unless danger-full-access is configured: Codex refuses an extra folder it
 * may not write, and runs read-only in a repository it has not trusted yet (ADR-0021).
 */
export function launchFlags(
  agent: Agent,
  defaults: SessionLaunch,
  mode?: 'plan',
  dirs: readonly string[] = [],
): string[] {
  return [...defaultFlags(agent, defaults, mode, dirs), ...modelArgs(agent, defaults)];
}

function defaultFlags(
  agent: Agent,
  defaults: LaunchDefaults,
  mode: 'plan' | undefined,
  dirs: readonly string[],
): string[] {
  if (agent === 'claude') {
    return defaults.claude.skipPermissions && !mode ? ['--dangerously-skip-permissions'] : [];
  }
  if (agent === 'codex') {
    const { approvalPolicy, bypass } = defaults.codex;
    if (bypass) return ['--dangerously-bypass-approvals-and-sandbox'];
    const sandbox = codexSandbox(defaults.codex, dirs);
    return [
      ...(approvalPolicy ? [`--ask-for-approval=${approvalPolicy}`] : []),
      ...(sandbox ? [`--sandbox=${sandbox}`] : []),
    ];
  }
  const { skipPermissions, mode: configured, sandbox } = defaults.antigravity;
  return [
    ...(skipPermissions ? ['--dangerously-skip-permissions'] : []),
    ...(configured && !mode ? [`--mode=${configured}`] : []),
    ...(sandbox ? ['--sandbox'] : []),
  ];
}

/** The launch flags of `agent` that turn off its permission checks or sandbox, for its receipt. */
export const dangerousFlags = (agent: Agent, defaults: LaunchDefaults, mode?: 'plan') =>
  launchFlags(agent, defaults, mode).filter((flag) => DANGEROUS.has(flag));

/**
 * The sandbox a Codex session with extra folders `dirs` runs in: workspace-write unless
 * danger-full-access is configured, else the configured one (ADR-0021).
 */
const codexSandbox = ({ sandbox }: LaunchDefaults['codex'], dirs: readonly string[]) =>
  dirs.length && sandbox !== 'danger-full-access' ? 'workspace-write' : sandbox;

/**
 * How a session with extra folders `dirs` overrides the profile's configured sandbox (launchFlags):
 * a read-only Codex runs workspace-write, said in its start's warning and kept in its receipt
 * (receipts/policy.ts). It takes a record's agent; a terminal never overrides. Undefined when it
 * does not.
 */
export function sandboxOverride(
  agent: Agent | 'terminal',
  defaults: LaunchDefaults,
  dirs: readonly string[],
) {
  const { sandbox, bypass } = defaults.codex;
  if (agent !== 'codex' || bypass || sandbox !== 'read-only') return undefined;
  if (codexSandbox(defaults.codex, dirs) === sandbox) return undefined;
  return {
    receipt: 'read-only to workspace-write',
    warning:
      'Codex runs read-only in this profile; this session gets workspace-write so it can change ' +
      'the other projects',
  };
}

/**
 * The extra folders an agent works in, an additional project's worktree each (CONTEXT.md,
 * Additional project), as its arguments: `--add-dir=<path>` (Claude Code, whose --add-dir takes
 * every word after it, the goal too, and Antigravity CLI), or `--add-dir <path>` (Codex).
 */
export const addDirArgs = (agent: Agent, dirs: readonly string[]) =>
  dirs.flatMap((dir) => (agent === 'codex' ? ['--add-dir', dir] : [`--add-dir=${dir}`]));
