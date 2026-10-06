import { existsSync } from 'node:fs';
import type { MesaContext } from '../context.js';
import { localDay } from '../lib/time.js';
import { listReceipts } from '../receipts/store.js';
import type { usageService } from './service.js';
import { usageTotals } from './summary.js';

/** A read-only seven-local-day view; receipts link to exact notes, while usage stays outside the vault. */
export function rewindService(ctx: MesaContext, usage: ReturnType<typeof usageService>) {
  return {
    week: async () => {
      const now = ctx.clock();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      const within = (at: string) => {
        const time = Date.parse(at);
        return time >= start.getTime() && time <= now.getTime();
      };
      const vault = ctx.vaultOf();
      const vaultAvailable = existsSync(vault);
      const notes = vaultAvailable
        ? listReceipts(vault, Number.POSITIVE_INFINITY).flatMap((entry) => {
            const kind = entry.receipt.kind;
            return entry.receipt.profile === ctx.profile && kind && within(entry.receipt.started)
              ? [
                  {
                    id: entry.receipt.id,
                    kind,
                    at: entry.receipt.started,
                    summary: entry.summary,
                    path: entry.path,
                  },
                ]
              : [];
          })
        : [];
      const records = ctx.store.list();
      const sessions = records
        .filter((record) => record.endedAt && within(record.endedAt))
        .map((record) => ({
          id: record.id,
          name: record.name ?? record.id,
          project: record.project,
          agent: record.agent,
          endedAt: record.endedAt as string,
          state: record.lastState.state,
        }))
        .sort((a, b) => b.endedAt.localeCompare(a.endedAt));
      const readings = await usage.list();
      const recent = new Set(
        records
          .filter(
            (record) =>
              Date.parse(record.startedAt) <= now.getTime() &&
              (!record.endedAt || Date.parse(record.endedAt) > start.getTime()),
          )
          .map((record) => record.id),
      );
      const unknown = readings.unknown.filter((item) => recent.has(item.session));
      const totals = usageTotals(readings.rows.filter((row) => within(row.at)));
      return {
        from: localDay(start),
        through: localDay(now),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        notes,
        sessions,
        usage: unknown.length
          ? {
              ...totals,
              input: null,
              output: null,
              cacheRead: null,
              cacheWrite: null,
              estimatedCostUsd: null,
            }
          : totals,
        missing: [
          ...(!vaultAvailable ? ['Vault is not initialized'] : []),
          ...unknown.map((item) => `${item.session}: ${item.reason}`),
        ],
      };
    },
  };
}

export type WeeklyRewind = Awaited<ReturnType<ReturnType<typeof rewindService>['week']>>;
