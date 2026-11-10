import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import type { ManagedRow, SessionRow } from '../sessions/board/rows.js';
import {
  deliverIdle,
  type IdleDelivery,
  idlePlacement,
  type Send,
} from '../sessions/input/idle-delivery.js';
import { reportLedger } from './report-ledger.js';
import { type ChildReport, reportPrompt } from './reports.js';

/** What `mesa reports` lists: whether delivery is on, and the pending reports. */
export type ReportList = { enabled: boolean; reports: ChildReport[] };

/** One parent's share of a delivery pass, with the ids of the reports it typed, or held. */
export type ReportDelivery = IdleDelivery & { reports: string[] };

export type ReportsDelivered = { deliveries: ReportDelivery[] };

/** A live Mesa agent session that can be typed into. */
const typeable = (row: SessionRow): row is ManagedRow =>
  row.managed &&
  row.alive &&
  !row.endedAt &&
  row.kind === 'interactive' &&
  row.agent !== 'terminal';

/**
 * Child reports for one profile (CONTEXT.md, Child report): the pending ones, and their delivery
 * into idle parents as one prompt each, through the same idle rule and decision receipt PR events
 * use (idle-delivery). A parent mid-turn or waiting on a person keeps its reports pending.
 */
export function reportsService(
  ctx: MesaContext,
  deps: {
    /** The board as it is now: each session's live state. */
    board: () => Promise<SessionRow[]>;
    send: Send;
  },
) {
  const ledger = reportLedger(ctx.paths.reports, ctx.paths.events, ctx);
  const enabled = () => ctx.open().config.sessions.childReports;
  const collect = () => ledger.collect(ctx.store.readable(), ctx.clock().toISOString());
  return {
    /** The pending reports, every parent's or `parent`'s. Sends nothing. */
    list: (parent?: string): ReportList => {
      if (parent !== undefined && !ctx.store.find(parent))
        throw new MesaError('not_found', `no session ${parent}; see mesa sessions`);
      const reports = collect().filter((r) => parent === undefined || r.parent === parent);
      return { enabled: enabled(), reports };
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
      const rows = new Map((await deps.board()).filter(typeable).map((row) => [row.id, row]));
      const { threshold } = ctx.open().config.decisions;
      const deliveries: ReportDelivery[] = [];
      for (const parent of new Set(pending.map((r) => r.parent))) {
        const row = rows.get(parent);
        const ids = pending.filter((r) => r.parent === parent).map((r) => r.id);
        if (!row) continue;
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
