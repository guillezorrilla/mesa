import type { MesaContext } from '../../context.js';
import type { Overrides } from '../../decisions/guardrail.js';
import type { Decision } from '../../decisions/types.js';
import { MesaError, toFail } from '../../lib/result.js';
import type { Recorded } from '../../receipts/recorder.js';
import type { ManagedRow } from '../board/rows.js';
import type { SessionState } from '../record/states.js';
import { type Sent, typedNothing } from './send.js';

// Typing Mesa's own news (PR events, child reports) into a session only while it is idle, with a
// decision receipt holding Faro's placement: the one owner of that rule.

/** The sessions service's send: the guardrail, then one prompt typed. */
export type Send = (
  id: string,
  prompt: string,
  opts: Overrides & { noFrom?: boolean },
) => Promise<Recorded<Sent>>;

/** The board's Faro placement of a session: its state, with its confidence and probabilities. */
export type Placement = {
  state: SessionState;
  confidence: number;
  probabilities: Record<string, number>;
  decision: Decision;
};

/** One session's share of a delivery pass. */
export type IdleDelivery = {
  session: string;
  /**
   * `delivered`: typed, once. `waiting`: the session is not idle, so it waits for the next pass.
   * `failed`: refused before anything was typed, so it waits too. `blocked`: the guardrail
   * refused it, and `uncertain`: the send broke mid-way; neither is sent again.
   */
  status: 'delivered' | 'waiting' | 'failed' | 'blocked' | 'uncertain';
  /** The session's state as the board placed it, with Faro's confidence. */
  state: SessionState;
  confidence: number;
  receipt?: Recorded<unknown>['receipt'];
  reason?: string;
  warning?: string;
};

/** A row's placement, from Faro's state answer; none without a Decision that has one. */
function placementOf(row: ManagedRow): Placement | undefined {
  const answer = row.decision?.answers.find((a) => a.id === 'state');
  if (!row.decision || answer?.kind !== 'Choice') return undefined;
  return {
    state: row.lastState.state,
    confidence: row.lastState.confidence,
    probabilities: answer.probabilities,
    decision: row.decision,
  };
}

/**
 * The placement to type into `row` with, or the `waiting` delivery to report: a session mid-turn
 * or waiting on a person, idle by a guess under `threshold` (it could be mid-turn), or idle with
 * no Faro placement to keep in the receipt, is never typed into.
 */
export function idlePlacement(
  row: ManagedRow,
  threshold: number,
): { placement: Placement } | { waiting: IdleDelivery } {
  const placement = placementOf(row);
  if (placement?.state === 'idle' && placement.confidence >= threshold) return { placement };
  const { state, confidence } = row.lastState;
  return {
    waiting: {
      session: row.id,
      status: 'waiting',
      state,
      confidence,
      ...(state !== 'idle'
        ? {}
        : placement
          ? { reason: `idle at confidence ${confidence}, under decisions.threshold ${threshold}` }
          : { reason: 'idle with no Faro placement' }),
    },
  };
}

/**
 * Types `prompt` into an idle session as from Mesa (no sender header), keeping a decision receipt
 * with the placement's state, confidence and probabilities. The caller claimed what it carries
 * first, and puts it back on `failed`, the only outcome that typed nothing.
 */
export async function deliverIdle(
  ctx: MesaContext,
  send: Send,
  row: ManagedRow,
  placement: Placement,
  what: { summary: string; failure: string; inputs: Record<string, unknown>; prompt: string },
): Promise<IdleDelivery> {
  const placed = { session: row.id, state: placement.state, confidence: placement.confidence };
  try {
    const recorded = await ctx.record(
      {
        kind: 'decision',
        summary: () => what.summary,
        failure: what.failure,
        project: () => row.project,
        session: () => row.id,
        inputs: what.inputs,
        outputs: (sent: Sent) => ({
          chars: sent.chars,
          state: placement.state,
          confidence: placement.confidence,
          probabilities: placement.probabilities,
        }),
        warning: (sent: Sent) => sent.warning,
      },
      async (decisions) => {
        decisions.record(placement.decision);
        return (await send(row.id, what.prompt, { noFrom: true })).result;
      },
    );
    return {
      ...placed,
      status: 'delivered',
      receipt: recorded.receipt,
      ...(recorded.warning ? { warning: recorded.warning } : {}),
    };
  } catch (error) {
    const reason = toFail(error).error.message;
    if (error instanceof MesaError && error.code === 'guardrail_blocked')
      return { ...placed, status: 'blocked', reason };
    return { ...placed, status: typedNothing(error) ? 'failed' : 'uncertain', reason };
  }
}
