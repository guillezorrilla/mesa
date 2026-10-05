import { z } from 'zod';
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

/** The flags that turn off an agent's own permission checks or sandbox. */
const DANGEROUS = new Set([
  '--dangerously-skip-permissions',
  '--dangerously-bypass-approvals-and-sandbox',
  '--sandbox=danger-full-access',
]);

/**
 * The flags a new or resumed session of `agent` starts with, one shell word each, from the
 * profile's launch defaults. A session in plan keeps plan: a configured mode gives way (Claude's
 * skip permissions is its bypassPermissions mode). Codex's bypass already means no approvals and
 * no sandbox, so it is the only flag Codex then gets. A Codex session with extra folders, `dirs`,
 * runs workspace-write unless danger-full-access is configured: Codex refuses an extra folder it
 * may not write, and runs read-only in a repository it has not trusted yet (ADR-0021).
 */
export function launchFlags(
  agent: Agent,
  defaults: LaunchDefaults,
  mode?: 'plan',
  dirs: readonly string[] = [],
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
