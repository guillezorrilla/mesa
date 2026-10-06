import { existsSync, statSync } from 'node:fs';
import { claudeTranscripts } from '../agents/claude/paths.js';
import { transcriptFile } from '../agents/claude/transcripts.js';
import { rolloutForThread } from '../agents/codex/rollouts.js';
import type { MesaContext } from '../context.js';
import { loadConfig } from '../profile/config.js';
import { claudeUsage, claudeUsageFiles } from './claude.js';
import { codexUsage } from './codex.js';
import type { UsageRecord } from './records.js';
import { sessionNativeIds, sessionWindow } from './sources.js';
import { type HookStamp, type SourceStamp, usageStore } from './store.js';
import { summarizeUsage } from './summary.js';

/** Syncs only this profile's sessions into its ledger; removed sessions keep their past usage. */
export function usageService(ctx: MesaContext) {
  const ledger = usageStore(ctx.paths.usage, ctx);
  return {
    list: async (session?: string) => {
      const fresh: UsageRecord[] = [];
      const unknown: { session: string; reason: string }[] = [];
      const cached = ledger.read();
      const scanned: Record<string, SourceStamp> = {};
      const scannedHooks: Record<string, HookStamp> = {};
      const records = ctx.store.list();
      for (const record of records) {
        if (session && record.id !== session) continue;
        if (record.agent === 'terminal') continue;
        const previous = Object.values(cached.sources).filter(
          (source) => source.session === record.id,
        );
        const { nativeIds, hook, lost } = sessionNativeIds(
          ctx,
          record,
          cached.hooks[record.id] ?? { offset: 0, nativeIds: [], changedIds: [] },
          previous.map((source) => source.nativeSessionId),
        );
        scannedHooks[record.id] = hook;
        if (lost) unknown.push({ session: record.id, reason: 'native session identity changed' });
        if (nativeIds.size === 0) {
          unknown.push({ session: record.id, reason: 'native session id is not available' });
          continue;
        }
        for (const nativeId of nativeIds) {
          const key = `${record.id}:${nativeId}`;
          const prior = cached.sources[key];
          const file =
            prior?.file && existsSync(prior.file)
              ? prior.file
              : record.agent === 'claude'
                ? transcriptFile(claudeTranscripts(ctx.home, ctx.env), nativeId)
                : record.agent === 'codex'
                  ? rolloutForThread({ home: ctx.home, env: ctx.env }, nativeId)
                  : undefined;
          if (!file) {
            unknown.push({ session: record.id, reason: `${record.agent} usage is unavailable` });
            continue;
          }
          try {
            const files = record.agent === 'claude' ? claudeUsageFiles(file) : [file];
            const stats = files.map((source) => statSync(source));
            const stamp: SourceStamp = {
              session: record.id,
              nativeSessionId: nativeId,
              file,
              size: stats.reduce((total, stat) => total + stat.size, 0),
              mtimeMs: Math.max(...stats.map((stat) => stat.mtimeMs)),
              // Raised when a reader counts differently, so sources it stamped are read again.
              reader: 2,
            };
            if (
              prior &&
              prior.file === file &&
              prior.size === stamp.size &&
              prior.mtimeMs === stamp.mtimeMs &&
              prior.reader === stamp.reader
            )
              continue;
            const readings =
              record.agent === 'claude'
                ? await claudeUsage(files, record.id, nativeId)
                : await codexUsage(file, record.id, nativeId);
            const within = sessionWindow(ctx, record);
            fresh.push(...readings.filter((row) => within(row.at)));
            scanned[key] = stamp;
          } catch {
            unknown.push({ session: record.id, reason: 'native usage file could not be read' });
          }
        }
      }
      const rows = ledger
        .merge(fresh, scanned, scannedHooks)
        .filter((row) => !session || row.session === session);
      const now = ctx.clock();
      const unknownIds = new Set(unknown.map((item) => item.session));
      const summary = summarizeUsage(
        rows,
        now,
        records.filter((record) => unknownIds.has(record.id)),
      );
      const known = summarizeUsage(
        rows.filter((row) => row.estimatedCostUsd !== null),
        now,
      );
      const config = existsSync(ctx.paths.config) ? loadConfig(ctx.paths.config).usage : undefined;
      const alerts = (
        [
          ['today', config?.dailyAlertUsd ?? 0],
          ['7d', config?.weeklyAlertUsd ?? 0],
          ['month', config?.monthlyAlertUsd ?? 0],
        ] as const
      ).flatMap(([period, thresholdUsd]) => {
        const knownCostUsd = known.periods[period].estimatedCostUsd;
        return !session && thresholdUsd > 0 && knownCostUsd !== null && knownCostUsd >= thresholdUsd
          ? [{ period, thresholdUsd, knownCostUsd }]
          : [];
      });
      return { rows, unknown, alerts, ...summary };
    },
  };
}
