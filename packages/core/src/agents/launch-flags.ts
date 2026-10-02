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
 * no sandbox, so it is the only flag Codex then gets.
 */
export function launchFlags(agent: Agent, defaults: LaunchDefaults, mode?: 'plan'): string[] {
  if (agent === 'claude') {
    return defaults.claude.skipPermissions && !mode ? ['--dangerously-skip-permissions'] : [];
  }
  if (agent === 'codex') {
    const { approvalPolicy, sandbox, bypass } = defaults.codex;
    if (bypass) return ['--dangerously-bypass-approvals-and-sandbox'];
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
