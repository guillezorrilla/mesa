import type { MesaContext } from '../context.js';
import { shortId } from '../lib/ids.js';
import { MesaError } from '../lib/result.js';
import type { SessionRow } from '../sessions/board/rows.js';
import {
  deliverIdle,
  type IdleDelivery,
  idlePlacement,
  type Send,
} from '../sessions/input/idle-delivery.js';
import { sendable } from '../sessions/record/lifecycle.js';
import { callerOf } from '../sessions/window/caller.js';
import { reportLedger } from './report-ledger.js';
import {
  type ChildReport,
  EXPLICIT_KINDS,
  explicitReport,
  isExplicitKind,
  type Question,
  questionOf,
  reportPrompt,
} from './reports.js';

/** What `mesa reports` lists: whether delivery is on, the pending reports and open questions. */
export type ReportList = { enabled: boolean; reports: ChildReport[]; questions: Question[] };

/** One parent's share of a delivery pass, with the ids of the reports it typed, or held. */
export type ReportDelivery = IdleDelivery & { reports: string[] };

export type ReportsDelivered = { deliveries: ReportDelivery[] };

const ledgerOf = (ctx: MesaContext) => reportLedger(ctx.paths.reports, ctx.paths.events, ctx);
/** Every child's new news, collected into the pending reports, which it returns. */
const collectAll = (ctx: MesaContext, ledger: ReturnType<typeof ledgerOf>) =>
  ledger.collect(ctx.store.readable(), ctx.clock().toISOString());

/**
 * Child reports for one profile (CONTEXT.md, Child report): the pending ones, and their delivery
 * into idle parents as one prompt each, through the same idle rule and decision receipt PR events
 * use (idle-delivery). A parent mid-turn or waiting on a person keeps its reports pending, and
 * gets them when its turn ends if its agent's Stop hook can go on (reportsAtTurnEnd).
 */
export function reportsService(
  ctx: MesaContext,
  deps: {
    /** The board as it is now: each session's live state. */
    board: () => Promise<SessionRow[]>;
    send: Send;
  },
) {
  const ledger = ledgerOf(ctx);
  const enabled = () => ctx.open().config.sessions.childReports;
  const collect = () => collectAll(ctx, ledger);
  /** The caller's session, a worker with a parent to report to, or a usage error naming why. */
  const reportingChild = () => {
    const caller = callerOf({ store: ctx.store, env: ctx.env, profileName: ctx.profile });
    const child = caller.session;
    if (!child)
      throw new MesaError(
        'usage',
        caller.inMesaWindow
          ? "this Mesa window's session is not in this profile"
          : 'mesa report runs inside a worker session started by another; this is no Mesa window',
      );
    if (child.parent === undefined)
      throw new MesaError('usage', `session ${child.id} has no parent to report to`);
    return { ...child, parent: child.parent };
  };
  return {
    /**
     * The caller's own report of its work (`mesa report`), for its parent: added to the pending
     * reports and kept as its newest explicit one. Refused, writing nothing, outside a Mesa
     * window, from a session with no parent, or with no text.
     */
    report: (kind: string, text: string, files: readonly string[] = []): ChildReport => {
      if (!isExplicitKind(kind))
        throw new MesaError(
          'usage',
          `report ${EXPLICIT_KINDS.join(', ')} or question, not ${kind}`,
        );
      const child = reportingChild();
      if (!text.trim()) throw new MesaError('usage', 'say what you did, found, and left');
      const report = explicitReport(child, kind, text, ctx.clock().toISOString(), files);
      ledger.add(report);
      return report;
    },
    /**
     * The caller's question for its parent (`mesa report question`): open, with a short id, and
     * pending as a `question` report until delivered. Refused as `report` is.
     */
    ask: (text: string): Question => {
      const child = reportingChild();
      if (!text.trim()) throw new MesaError('usage', 'say what you want to ask');
      const taken = new Set(ledger.questions().map((q) => q.id));
      const draw = () => `q-${shortId(ctx.newId).slice(-4)}`;
      // Four characters a person can type; a clash draws again, then takes eight.
      let id = draw();
      for (let tries = 0; taken.has(id) && tries < 8; tries++) id = draw();
      if (taken.has(id)) id = `q-${shortId(ctx.newId)}`;
      const { question, report } = questionOf(child, id, text, ctx.clock().toISOString());
      ledger.ask(question, report);
      return question;
    },
    /**
     * Answers open question `id`: types `[mesa] answer to your question <id>:` and `answer` into
     * its worker through `send` (its sender, guardrail, and waiting refusals), then marks it
     * answered. From a Mesa window only the question's parent may; a person outside one may. An
     * unknown id is not_found, an answered one a usage error; a send that fails leaves it open.
     */
    reply: async (id: string, answer: string) => {
      const asked = ledger.questions().find((q) => q.id === id);
      if (!asked) throw new MesaError('not_found', `no question ${id}; see mesa reports`);
      if (asked.answeredAt)
        throw new MesaError('usage', `question ${id} was answered at ${asked.answeredAt}`);
      if (!answer.trim()) throw new MesaError('usage', 'the answer is empty');
      const caller = callerOf({ store: ctx.store, env: ctx.env, profileName: ctx.profile });
      if (caller.inMesaWindow && caller.session?.id !== asked.parent)
        throw new MesaError(
          'usage',
          `question ${id} is for session ${asked.parent}; only it, or a person, answers it`,
        );
      // Claimed first, under the lock, so two replies never both reach the worker.
      const claim = ledger.answer(id, {
        answer,
        answeredAt: ctx.clock().toISOString(),
        answeredBy: caller.session?.id ?? 'person',
      });
      if (!claim) throw new MesaError('usage', `question ${id} was answered meanwhile`);
      try {
        const prompt = `[mesa] answer to your question ${id}:\n${answer}`;
        const sent = await deps.send(asked.child, prompt, {});
        return { question: claim.question, sent: sent.result, receipt: sent.receipt };
      } catch (error) {
        ledger.reopen(claim);
        throw error;
      }
    },
    /**
     * The pending reports and open questions, every parent's or `parent`'s, oldest first; sends
     * nothing. Off, it reads what was pending without collecting more.
     */
    list: (parent?: string): ReportList => {
      if (parent !== undefined && !ctx.store.find(parent))
        throw new MesaError('not_found', `no session ${parent}; see mesa sessions`);
      const on = enabled();
      const mine = <T extends { parent: string }>(r: T) =>
        parent === undefined || r.parent === parent;
      const reports = (on ? collect() : ledger.pending()).filter(mine);
      const questions = ledger
        .questions()
        .filter((q) => !q.answeredAt && mine(q))
        .sort((a, b) => a.at.localeCompare(b.at));
      return { enabled: on, reports, questions };
    },
    /**
     * With `sessions.childReports` on, types each idle parent's pending reports as one prompt;
     * the others wait. Off, a usage error that sends nothing.
     */
    deliver: async (): Promise<ReportsDelivered> => {
      if (!enabled())
        throw new MesaError(
          'usage',
          'child reports are off; turn them on with mesa config set sessions.childReports true',
        );
      const pending = collect();
      if (!pending.length) return { deliveries: [] };
      const board = await deps.board();
      const rows = new Map(board.filter(sendable).map((row) => [row.id, row]));
      const { threshold } = ctx.open().config.decisions;
      const deliveries: ReportDelivery[] = [];
      for (const parent of new Set(pending.map((r) => r.parent))) {
        const row = rows.get(parent);
        const ids = pending.filter((r) => r.parent === parent).map((r) => r.id);
        if (!row) {
          // Over, or no agent to type into: they wait, for a successor or a resume.
          const seen = board.find((r) => r.managed && r.id === parent)?.lastState ??
            ctx.store.find(parent)?.lastState ?? { state: 'done' as const, confidence: 1 };
          deliveries.push({
            session: parent,
            reports: ids,
            status: 'waiting',
            state: seen.state,
            confidence: seen.confidence,
            reason: 'the parent is over or has no agent to type into',
          });
          continue;
        }
        const idle = idlePlacement(row, threshold);
        if ('waiting' in idle) {
          deliveries.push({ ...idle.waiting, reports: ids });
          continue;
        }
        const claimed = ledger.claim(ids);
        // Another mesa claimed them since: its pass delivers them.
        if (!claimed.length) continue;
        const delivery = await deliverIdle(ctx, deps.send, row, idle.placement, {
          summary: `Typed ${claimed.length} child reports into session ${parent}`,
          failure: `Could not type child reports into session ${parent}`,
          inputs: { session: parent, reports: claimed.map((r) => r.id) },
          prompt: reportPrompt(claimed),
        });
        if (delivery.status === 'failed') ledger.release(claimed);
        deliveries.push({ ...delivery, reports: claimed.map((r) => r.id) });
      }
      return { deliveries };
    },
  };
}

/**
 * The prompt that carries `parent`'s pending reports as its own turn ends (its Stop hook), with
 * them claimed and a decision receipt kept; none with reports off or nothing pending. It reads
 * only the reports file, the records and the children's hook logs: no board look, since a turn
 * that just ended is the placement, at confidence 1.
 */
export async function reportsAtTurnEnd(
  ctx: MesaContext,
  parent: string,
): Promise<string | undefined> {
  // A config that does not read is reports off, never a failed hook.
  if (!ctx.configIfAny()?.sessions.childReports) return undefined;
  // A session no child names has nothing to collect: most Stops end here.
  if (!ctx.store.readable().some((r) => r.parent === parent)) return undefined;
  const ledger = ledgerOf(ctx);
  const ids = collectAll(ctx, ledger)
    .filter((r) => r.parent === parent)
    .map((r) => r.id);
  const claimed = ids.length ? ledger.claim(ids) : [];
  if (!claimed.length) return undefined;
  const prompt = reportPrompt(claimed);
  // The reports are claimed: a receipt that cannot be written never keeps them from the parent.
  await ctx
    .record(
      {
        kind: 'decision',
        summary: () =>
          `Gave ${claimed.length} child reports to session ${parent} as its turn ended`,
        failure: `Could not give child reports to session ${parent}`,
        project: () => ctx.store.find(parent)?.project,
        session: () => parent,
        inputs: { session: parent, reports: claimed.map((r) => r.id) },
        outputs: () => ({ via: 'Stop hook', chars: prompt.length, confidence: 1 }),
      },
      async () => prompt,
    )
    .catch(() => undefined);
  return prompt;
}

/** A worker's newest explicit report as `mesa show` gives it (`report`). */
export type KeptReport = Pick<ChildReport, 'kind' | 'outcome' | 'at' | 'files'> & {
  message: string;
};

/** `child`'s newest explicit report (`mesa report`), delivered or not, as `mesa show` gives it. */
export function keptReport(ctx: MesaContext, child: string): KeptReport | undefined {
  const said = ledgerOf(ctx).explicit(child);
  return (
    said && {
      kind: said.kind,
      ...(said.outcome ? { outcome: said.outcome } : {}),
      at: said.at,
      message: said.message ?? '',
      ...(said.files ? { files: said.files } : {}),
    }
  );
}

/**
 * Each child's newest report that says something, delivered or not (the Crew panel's), with their
 * news collected first when reports are on.
 */
export function latestReports(ctx: MesaContext): Record<string, ChildReport> {
  const ledger = ledgerOf(ctx);
  if (ctx.configIfAny()?.sessions.childReports) collectAll(ctx, ledger);
  return ledger.latest();
}
