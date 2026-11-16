import { hooksStatus as antigravityHooks } from '../../agents/antigravity/hooks.js';
import { hooksStatus as claudeHooks } from '../../agents/claude/hooks.js';
import { hooksStatus as codexHooks } from '../../agents/codex/hooks.js';
import { codexHome } from '../../agents/codex/paths.js';
import { NO_MODEL } from '../../decisions/evaluate.js';
import { siteMode } from '../../decisions/site-mode.js';
import type { DecisionsModel } from '../../decisions/types.js';
import type { Env } from '../../lib/process.js';
import type { SessionRecord } from '../record/record.js';
import type { InstructionStatus } from './instructions.js';

// Whether a session's agent can reach decision assistance (#463, ADR-0019), in the instruction
// status's words plus `disabled`: the decision command (`mesa decisions evaluate`) and automatic
// advice (its turn hook), each configured or why not, beside when Mesa last saw it used.
// Configuration, not proof: only the provider's transcript shows the agent read the advice.

export type DeliveryStatus = {
  state: InstructionStatus['state'] | 'disabled';
  reason: string;
  /** When Mesa last saw it happen: the command called from the session, advice sent. */
  observedAt?: string;
};

/** What the session's decision assistance holds (DecisionAssistance.assistState). */
export type AssistState = {
  model: DecisionsModel;
  /** The person's opt-in to automatic decisions where the model is not proven yet. */
  experimental: boolean;
  off: boolean;
  seen: { tool?: string; advice?: string };
};

const at = (observedAt?: string) => (observedAt ? { observedAt } : {});

/** Why neither the tool nor advice is on, whatever is configured. */
function disabled(record: SessionRecord, state: AssistState): DeliveryStatus | undefined {
  if (record.agent === 'terminal')
    return { state: 'unsupported', reason: 'A plain terminal runs no agent' };
  if (state.model === 'none') return { state: 'disabled', reason: NO_MODEL };
  if (state.off) return { state: 'disabled', reason: 'Turned off for this session' };
  return undefined;
}

/** The decision command: `mesa decisions evaluate`, through the mesa skill (ADR-0031). */
function toolStatus(record: SessionRecord, state: AssistState): DeliveryStatus {
  const seen = at(state.seen.tool);
  return (
    disabled(record, state) ?? {
      state: 'configured',
      reason: 'mesa decisions evaluate, through the mesa skill',
      ...seen,
    }
  );
}

/**
 * Automatic advice: only where the model runs relevance automatically (siteMode), through the
 * turn hook the #459 probe proved: Claude Code's and Codex's UserPromptSubmit, Antigravity's
 * PreInvocation (the saved goal's ready answer, as its hook carries no prompt). A native identity
 * Mesa no longer holds (`identityChanged`, a /clear or a nested agent) gets none.
 */
function adviceStatus(
  record: SessionRecord,
  state: AssistState,
  hosts: { home: string; env: Env; self: readonly string[] },
  identityChanged: boolean | 'ambiguous',
): DeliveryStatus {
  const seen = at(state.seen.advice);
  const why = disabled(record, state);
  if (why) return { ...why, ...seen };
  if (siteMode(state.model, 'relevance', state.experimental).mode !== 'automatic')
    return {
      state: 'disabled',
      reason: `${state.model} is not proven for automatic advice yet; on demand only`,
      ...seen,
    };
  if (identityChanged)
    return {
      state: 'conflicting',
      reason: 'Another native conversation took over; reopen through Mesa',
      ...seen,
    };
  const { home, env, self } = hosts;
  try {
    if (record.agent === 'antigravity') {
      const hooks = antigravityHooks(home, self);
      if (!record.goal)
        return {
          state: 'unsupported',
          reason: 'Antigravity hooks carry no prompt; it needs a saved goal',
        };
      // Its advice is only the answer goalPreparing asks for, which a skill run's window skips.
      if (record.kind !== 'interactive')
        return {
          state: 'unsupported',
          reason:
            "Antigravity's advice is the goal's answer asked as its window starts; a skill run asks none",
        };
      if (hooks.stale)
        return {
          state: 'conflicting',
          reason: 'Mesa hooks are stale; run mesa hooks install',
          ...seen,
        };
      return hooks.installed
        ? { state: 'configured', reason: "PreInvocation re-sends the goal's ready advice", ...seen }
        : { state: 'missing', reason: 'Run mesa hooks install', ...seen };
    }
    const codex = record.agent === 'codex' ? codexHooks(codexHome(home, env), self) : undefined;
    const hooks = codex ?? claudeHooks(home, env, self);
    if (!hooks.events.UserPromptSubmit)
      return hooks.stale
        ? { state: 'conflicting', reason: 'Mesa hooks are stale; run mesa hooks install', ...seen }
        : { state: 'missing', reason: 'Run mesa hooks install', ...seen };
    // Codex runs a changed hook only once the person reviews it; Mesa never trusts it for them.
    if (codex && !codex.trusted.UserPromptSubmit)
      return { state: 'conflicting', reason: 'Review and trust the Mesa hook in Codex', ...seen };
    return { state: 'configured', reason: 'UserPromptSubmit adds advice to the turn', ...seen };
  } catch {
    return { state: 'conflicting', reason: 'Native hook configuration could not be read', ...seen };
  }
}

/** The session's decision tool and automatic advice, each configured or why not, and when seen. */
export function decisionStatus(
  record: SessionRecord,
  state: AssistState,
  hosts: { home: string; env: Env; self: readonly string[] },
  identityChanged: boolean | 'ambiguous' = false,
) {
  return {
    tool: toolStatus(record, state),
    advice: adviceStatus(record, state, hosts, identityChanged),
  };
}

export type DecisionDeliveryStatus = ReturnType<typeof decisionStatus>;

/** Whether a pointer carries the `Decisions:` line: while the decision command is configured. */
export const decisionsReach = (tool: DeliveryStatus) => tool.state === 'configured';
