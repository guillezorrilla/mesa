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
export const AGENT_EXECUTABLES = { claude: 'claude', codex: 'codex', antigravity: 'agy' } as const;

/** Qualified native operations. Mesa-owned stop, queue, handoff, and worktree controls apply to all. */
export const AGENT_CAPABILITIES = {
  claude: {
    verifiedVersion: '2.1.284',
    interactive: true,
    headless: true,
    nativeId: true,
    resume: true,
    plan: true,
    background: true,
    fork: true,
    adopt: true,
    history: true,
    search: true,
    context: true,
    nativeState: 'hook-and-listing',
  },
  codex: {
    verifiedVersion: '0.157.1',
    interactive: true,
    headless: true,
    nativeId: true,
    resume: true,
    plan: false,
    background: false,
    fork: true,
    adopt: true,
    history: true,
    search: true,
    context: true,
    nativeState: 'hook-or-screen',
  },
  antigravity: {
    verifiedVersion: '1.2.12',
    interactive: true,
    headless: true,
    nativeId: true,
    resume: true,
    plan: true,
    background: false,
    fork: false,
    adopt: false,
    history: false,
    search: false,
    context: false,
    nativeState: 'screen-only',
  },
} as const;

export type AgentCapability = Exclude<
  keyof (typeof AGENT_CAPABILITIES)['claude'],
  'nativeState' | 'verifiedVersion'
>;
export const supportsAgentCapability = (agent: Agent, capability: AgentCapability): boolean =>
  AGENT_CAPABILITIES[agent][capability];
export const supportsPlanStart = (agent: Agent) => supportsAgentCapability(agent, 'plan');

type AgentCapabilityResult = (typeof AGENT_CAPABILITIES)[Agent] & {
  installed: boolean;
  version?: string;
  matchesVerifiedVersion: boolean;
};

/** Join Doctor's live probe to the version on which each native operation was qualified. */
export function agentCapabilityReport(
  checks: readonly { name: string; ok: boolean; version?: string }[],
) {
  return Object.fromEntries(
    AGENT_NAMES.map((agent) => {
      const capability = AGENT_CAPABILITIES[agent];
      const check = checks.find((row) => row.name === AGENT_EXECUTABLES[agent]);
      return [
        agent,
        {
          ...capability,
          installed: check?.ok === true,
          ...(check?.version ? { version: check.version } : {}),
          matchesVerifiedVersion:
            check?.ok === true && check.version === capability.verifiedVersion,
        },
      ];
    }),
  ) as Record<Agent, AgentCapabilityResult>;
}

/** The permission modes `claude -p --permission-mode` takes (Claude Code 2.1.283). */
export const CLAUDE_PERMISSION_MODES = [
  'acceptEdits',
  'auto',
  'bypassPermissions',
  'manual',
  'dontAsk',
  'plan',
] as const;
