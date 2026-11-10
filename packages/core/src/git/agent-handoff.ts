import type { MesaContext } from '../context.js';
import { redactWhole } from '../lib/redact.js';
import { MesaError } from '../lib/result.js';
import { typeable } from '../lib/untrusted-text.js';
import type { Checkout } from '../projects/checkout.js';
import type { ManagedRow, SessionRow } from '../sessions/board/rows.js';
import { deliverIdle, idlePlacement, type Send } from '../sessions/input/idle-delivery.js';
import { heldWorktrees, real } from '../sessions/record/holders.js';
import { dataFence } from './recipes.js';

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
      (heldWorktrees(row).some(({ worktree }) => real(worktree.path) === checkout.path) ||
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
    const why = delivered.reason ?? delivered.status;
    throw new MesaError(
      delivered.status === 'blocked' ? 'guardrail_blocked' : 'usage',
      delivered.status === 'uncertain'
        ? `the send to session ${target.id} broke partway, so some of it may have been typed: ${why}`
        : `nothing was handed to session ${target.id}: ${why}`,
    );
  }
  return { session: target.id, how: 'sent' };
}

/** Bytes `text` takes once shell-quoted into a goal (shellWord): each `'` grows to four. */
const quotedBytes = (text: string) => Buffer.byteLength(text) + 3 * (text.split("'").length - 1);

/**
 * `text` within `max` quoted bytes, its start or its end kept, with a line saying how much was cut:
 * whole lines, or part of the first (or last) line when it alone is longer.
 */
export function keptBytes(text: string, max: number, keep: 'start' | 'end') {
  if (quotedBytes(text) <= max) return text;
  const lines = text.split('\n');
  if (keep === 'end') lines.reverse();
  const kept: string[] = [];
  let size = 0;
  for (const line of lines) {
    if (size + quotedBytes(line) + 1 > max) {
      const room = Math.floor(max / 4);
      if (!kept.length) kept.push(keep === 'end' ? line.slice(-room) : line.slice(0, room));
      break;
    }
    size += quotedBytes(line) + 1;
    kept.push(line);
  }
  if (keep === 'end') kept.reverse();
  const cut = Buffer.byteLength(text) - Buffer.byteLength(kept.join('\n'));
  return keep === 'end'
    ? [`[Mesa left out the first ${cut} bytes]`, ...kept].join('\n')
    : [...kept, `[Mesa left out the last ${cut} bytes]`].join('\n');
}

/** Which session a checkout's problem goes to, as `mesa git fix` and `mesa git resolve` take it. */
export type HandoffTarget = { checkout?: string; session?: string; fresh?: boolean };

/**
 * `text` from the checkout for a hand-off prompt: redacted, without control characters, its start
 * or end within `bytes` so a new session's goal fits one tmux command (requireCommandFits), fenced
 * as data.
 */
export const promptData = (
  ctx: MesaContext,
  fence: string,
  text: string,
  bytes: number,
  keep: 'start' | 'end',
) =>
  dataFence(
    fence,
    keptBytes(typeable(redactWhole(text, ctx.home, ctx.secrets())).trimEnd(), bytes, keep),
  );
