import { sessionBranch } from '../record/labels.js';
import type { CrewRow } from './crew.js';
import type { SessionRow } from './rows.js';

// What an agent inside a Mesa window reads of the sessions (CONTEXT.md, Agent view): a few fields
// a row, not every field of every record, which it would reread every later turn
// (docs/spikes/token-usage.md; orca's agent view). `--full` and every caller outside a window, the
// app's bridge too, get the whole rows.

/** A board row as an agent reads it: who it is, where it works, and its state now. */
export function agentRow(s: SessionRow) {
  const branch = sessionBranch(s);
  return {
    id: s.id,
    ...(s.name ? { name: s.name } : {}),
    project: s.project,
    agent: s.agent,
    ...(s.managed ? { kind: s.kind } : {}),
    state: s.lastState.state,
    confidence: s.lastState.confidence,
    ...(s.managed && s.parent ? { parent: s.parent } : {}),
    ...(branch ? { branch } : {}),
    alive: s.alive,
    startedAt: s.startedAt,
    ...(s.managed && s.endedAt ? { endedAt: s.endedAt } : {}),
    ...(s.managed && s.progress ? { progress: s.progress } : {}),
    // A --tree row's place under its parent.
    ...('depth' in s && typeof s.depth === 'number' ? { depth: s.depth } : {}),
  };
}

/** A crew row as an agent reads it: its board row's few fields, its newest report and its diff. */
export const agentCrewRow = (s: CrewRow) => ({
  ...agentRow(s),
  ...(s.report ? { report: s.report } : {}),
  ...(s.diff ? { diff: s.diff } : {}),
});

type Status = { state: string };

/**
 * A shown session as an agent reads it: its instruction hook, vault, and decision tool and advice
 * as their state alone.
 */
export const agentShown = <
  T extends { instructions: Status; vault: Status; decisions: { tool: Status; advice: Status } },
>(
  shown: T,
) => ({
  ...shown,
  instructions: shown.instructions.state,
  vault: shown.vault.state,
  decisions: { tool: shown.decisions.tool.state, advice: shown.decisions.advice.state },
});
