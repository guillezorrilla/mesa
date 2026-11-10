import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import type { Checkout } from '../projects/checkout.js';
import type { ManagedRow, SessionRow } from '../sessions/board/rows.js';
import { deliverIdle, idlePlacement, type Send } from '../sessions/input/idle-delivery.js';
import { heldWorktrees } from '../sessions/record/holders.js';

// Handing a checkout's problem (a failed pre-commit hook, a conflict) to an agent: the one owner
// of which session gets it, and of sending it there or starting one with it as its goal. Mesa
// never edits the checkout's files itself.

export type AgentHandoff = { session: string; how: 'sent' | 'started' };

export type HandoffDeps = {
  /** The board as it is now: each session's live state. */
  board: () => Promise<SessionRow[]>;
  send: Send;
  /** The sessions service's open: a new session in `checkout` (none for the main checkout). */
  open: (project: string, opts: { goal: string; checkout?: string }) => Promise<{ id: string }>;
};

/** The unended Mesa sessions working in `checkout`: in it as their worktree, or for the main checkout, on the project with none. */
function sessionsIn(rows: readonly SessionRow[], checkout: Checkout) {
  return rows.filter(
    (row): row is ManagedRow =>
      row.managed &&
      !row.endedAt &&
      row.kind !== 'run' &&
      row.agent !== 'terminal' &&
      (heldWorktrees(row).some(({ worktree }) => worktree.path === checkout.path) ||
        (checkout.registered && row.project === checkout.project && !row.worktree)),
  );
}

/**
 * Hands `prompt` to the session working in `checkout`: `session` when given, else the one unended
 * Mesa session there; a new session started there with it as its goal when there is none, or with
 * `fresh`. It is sent only while that session is idle (idlePlacement, with its decision receipt);
 * busy, waiting on a person, or several sessions there, it refuses as usage and sends nothing.
 */
export async function handToAgent(
  ctx: MesaContext,
  deps: HandoffDeps,
  checkout: Checkout,
  input: { prompt: string; summary: string; session?: string; fresh?: boolean },
): Promise<AgentHandoff> {
  if (input.session && input.fresh)
    throw new MesaError('usage', 'pass --session or --new, not both');
  const start = async (): Promise<AgentHandoff> => {
    const opened = await deps.open(checkout.project, {
      goal: input.prompt,
      ...(checkout.registered ? {} : { checkout: checkout.path }),
    });
    return { session: opened.id, how: 'started' };
  };
  if (input.fresh) return start();
  const rows = await deps.board();
  const there = sessionsIn(rows, checkout);
  let target: ManagedRow | undefined;
  if (input.session) {
    target = rows.find((row): row is ManagedRow => row.managed && row.id === input.session);
    if (!target || target.endedAt)
      throw new MesaError('not_found', `no live session ${input.session}`);
  } else if (there.length > 1) {
    throw new MesaError(
      'usage',
      `several sessions work in ${checkout.path} (${there.map((row) => row.id).join(', ')}): pass --session <id>, or --new`,
    );
  } else {
    target = there[0];
  }
  if (!target) return start();
  const idle = idlePlacement(target, ctx.open().config.decisions.threshold);
  if ('waiting' in idle) {
    const { state, reason } = idle.waiting;
    throw new MesaError(
      'usage',
      `session ${target.id} is ${state}${reason ? ` (${reason})` : ''}, so nothing was sent: try again once it is idle, or pass --new`,
    );
  }
  const delivered = await deliverIdle(ctx, deps.send, target, idle.placement, {
    summary: input.summary,
    failure: `Could not hand ${checkout.path} to session ${target.id}`,
    inputs: { checkout: checkout.path, session: target.id },
    prompt: input.prompt,
  });
  if (delivered.status !== 'delivered') {
    throw new MesaError(
      delivered.status === 'blocked' ? 'guardrail_blocked' : 'usage',
      `nothing was handed to session ${target.id}: ${delivered.reason ?? delivered.status}`,
    );
  }
  return { session: target.id, how: 'sent' };
}
