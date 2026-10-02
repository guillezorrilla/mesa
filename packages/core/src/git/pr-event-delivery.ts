import type { MesaContext } from '../context.js';
import type { Overrides } from '../decisions/guardrail.js';
import { MesaError, toFail } from '../lib/result.js';
import type { Recorded } from '../receipts/recorder.js';
import type { ManagedRow, SessionRow } from '../sessions/board/rows.js';
import type { Sent } from '../sessions/send.js';
import type { SessionState } from '../sessions/states.js';
import type { GhState } from './gh.js';
import { prEventLedger } from './pr-event-ledger.js';
import { type PrEvent, type PrProblem, type PrWatch, scanPrEvents } from './pr-events.js';

/** What `mesa pr-events` reports: whether forwarding is on, gh's state, and what is pending. */
export type PrEventList = {
  enabled: boolean;
  gh: GhState;
  events: PrEvent[];
  problems: PrProblem[];
};

/** One session's share of a delivery pass. */
export type PrEventDelivery = {
  session: string;
  /** The ids of the events this pass forwarded, or held. */
  events: string[];
  /**
   * `delivered`: typed, once. `waiting`: the session is not idle, so they wait for the next pass.
   * `failed`: refused before anything was typed, so they wait too. `blocked`: the guardrail
   * refused them, and `uncertain`: the send broke mid-way; neither is sent again.
   */
  status: 'delivered' | 'waiting' | 'failed' | 'blocked' | 'uncertain';
  /** The session's state as the board placed it, with Faro's confidence. */
  state: SessionState;
  confidence: number;
  receipt?: Recorded<unknown>['receipt'];
  reason?: string;
  warning?: string;
};

export type PrEventsDelivered = Omit<PrEventList, 'events' | 'enabled'> & {
  deliveries: PrEventDelivery[];
};

/** At most this many events go in one prompt; the rest wait for the session's next idle turn. */
const PER_PROMPT = 10;

type Send = (
  id: string,
  prompt: string,
  opts: Overrides & { noFrom?: boolean },
) => Promise<Recorded<Sent>>;

/** A live Mesa agent session in its own worktree: the ones whose branch can have a pull request. */
const watched = (
  row: SessionRow,
): row is ManagedRow & { worktree: { path: string; branch: string } } =>
  row.managed &&
  row.alive &&
  !row.endedAt &&
  row.kind === 'interactive' &&
  row.agent !== 'terminal' &&
  row.worktree !== undefined;

const REVIEW_STATES: Record<string, string> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'requested changes',
  COMMENTED: 'commented',
  DISMISSED: 'was dismissed',
};

/** One line of the prompt for one event, with its link. */
function line(event: PrEvent): string {
  const said = event.excerpt ? `: "${event.excerpt}"` : '';
  const who = event.author ?? 'someone';
  switch (event.kind) {
    case 'check-failed':
      return `- check "${event.check}" failed: ${event.url}`;
    case 'check-fixed':
      return `- check "${event.check}" passes again: ${event.url}`;
    case 'review':
      return `- ${who} ${REVIEW_STATES[event.state ?? ''] ?? 'reviewed'}${said} ${event.url}`;
    case 'comment':
      return `- ${who} commented${said} ${event.url}`;
    case 'review-comment':
      return `- ${who} commented on ${event.path ?? 'the diff'}${said} ${event.url}`;
  }
}

/** One short prompt for one session's events, each pull request with its link. */
export function prEventPrompt(events: readonly PrEvent[]): string {
  const prs = new Map<number, PrEvent[]>();
  for (const event of events)
    prs.set(event.pr.number, [...(prs.get(event.pr.number) ?? []), event]);
  return [...prs.values()]
    .map((group) => {
      const pr = group[0]?.pr;
      return [
        `[mesa] PR #${pr?.number} (${pr?.url}) on your branch has news:`,
        ...group.map(line),
      ].join('\n');
    })
    .join('\n');
}

/** Whether a refused send typed nothing, so its events can wait for another pass (as sendReview). */
const typedNothing = (error: unknown) =>
  error instanceof MesaError &&
  (error.code === 'usage' ||
    (error.code === 'not_found' &&
      typeof error.details === 'object' &&
      error.details !== null &&
      'safeNoSend' in error.details &&
      error.details.safeNoSend === true));

/**
 * PR events for one profile: the pending ones, and their delivery into idle sessions. A session
 * mid-turn or waiting on a person is never typed into: its events wait for a pass that finds it
 * idle with Faro's confidence at `decisions.threshold` or above. Each delivered prompt keeps a decision receipt holding the board's Faro placement of the
 * session (state probabilities and confidence) that let it through.
 */
export function prEventsService(
  ctx: MesaContext,
  deps: {
    /** The board as it is now: each session's live state. */
    board: () => Promise<SessionRow[]>;
    /** The sessions service's send: the guardrail, then one prompt typed. */
    send: Send;
  },
) {
  const ledger = prEventLedger(ctx.paths.prEvents);
  const scan = async () => {
    const rows = (await deps.board()).filter(watched);
    const watches: PrWatch[] = rows.map((row) => ({
      session: row.id,
      project: row.project,
      branch: row.worktree.branch,
      cwd: row.worktree.path,
      since: row.startedAt,
    }));
    return { rows, found: await scanPrEvents(ctx.deps.run, watches, ledger.read()) };
  };
  const enabled = () => ctx.open().config.sessions.prEvents;

  /** Forwards one idle session's events as one prompt, claimed first so it is never sent twice. */
  const deliverTo = async (
    row: ManagedRow,
    pending: PrEvent[],
  ): Promise<PrEventDelivery | undefined> => {
    const placed = {
      session: row.id,
      state: row.lastState.state,
      confidence: row.lastState.confidence,
    };
    const claimed = ledger.claim(pending.slice(0, PER_PROMPT));
    const events = claimed.map((event) => event.id);
    // Another mesa claimed them since the scan: its pass delivers them.
    if (!claimed.length) return undefined;
    try {
      const recorded = await ctx.record(
        {
          kind: 'decision',
          summary: () => `Forwarded ${claimed.length} PR events to session ${row.id}`,
          failure: `Could not forward PR events to session ${row.id}`,
          project: () => row.project,
          session: () => row.id,
          inputs: {
            session: row.id,
            events,
            pullRequests: [...new Set(claimed.map((event) => event.pr.url))],
          },
          outputs: (sent: Sent) => ({
            chars: sent.chars,
            state: row.lastState.state,
            confidence: row.lastState.confidence,
          }),
          warning: (sent: Sent) => sent.warning,
        },
        async (decisions) => {
          if (row.decision) decisions.record(row.decision);
          return (await deps.send(row.id, prEventPrompt(claimed), { noFrom: true })).result;
        },
      );
      return {
        ...placed,
        events,
        status: 'delivered',
        receipt: recorded.receipt,
        ...(recorded.warning ? { warning: recorded.warning } : {}),
      };
    } catch (error) {
      const reason = toFail(error).error.message;
      if (error instanceof MesaError && error.code === 'guardrail_blocked')
        return { ...placed, events, status: 'blocked', reason };
      if (!typedNothing(error)) return { ...placed, events, status: 'uncertain', reason };
      ledger.release(claimed);
      return { ...placed, events, status: 'failed', reason };
    }
  };

  return {
    /** The pending PR events of every live session on a branch, and gh's state. Sends nothing. */
    list: async (): Promise<PrEventList> => {
      const { found } = await scan();
      return { enabled: enabled(), ...found };
    },
    /**
     * With `sessions.prEvents` on, forwards each idle session's pending events as one prompt;
     * the others wait. Off, a usage error that sends nothing.
     */
    deliver: async (): Promise<PrEventsDelivered> => {
      if (!enabled())
        throw new MesaError(
          'usage',
          'PR events are off; turn them on with mesa config set sessions.prEvents true',
        );
      const { rows, found } = await scan();
      const deliveries: PrEventDelivery[] = [];
      const { threshold } = ctx.open().config.decisions;
      for (const row of rows) {
        const pending = found.events.filter((event) => event.session === row.id);
        if (!pending.length) continue;
        const { state, confidence } = row.lastState;
        // Idle by a guess under the threshold could be mid-turn: it waits, as working does.
        if (state !== 'idle' || confidence < threshold) {
          deliveries.push({
            session: row.id,
            events: pending.map((event) => event.id),
            status: 'waiting',
            state,
            confidence,
            ...(state === 'idle'
              ? {
                  reason: `idle at confidence ${confidence}, under decisions.threshold ${threshold}`,
                }
              : {}),
          });
          continue;
        }
        const delivery = await deliverTo(row, pending);
        if (delivery) deliveries.push(delivery);
      }
      return { gh: found.gh, problems: found.problems, deliveries };
    },
  };
}
