import { existsSync, statSync } from 'node:fs';
import { claudeTranscripts } from '../agents/claude/paths.js';
import { transcriptFile } from '../agents/claude/transcripts.js';
import { rolloutForThread } from '../agents/codex/rollouts.js';
import type { MesaContext } from '../context.js';
import { loadConfig } from '../profile/config.js';
import { scanHookEvents } from '../sessions/hook-events.js';
import { claudeUsage } from './claude.js';
import { codexUsage } from './codex.js';
import type { UsageRecord } from './records.js';
import { type HookStamp, type SourceStamp, usageStore } from './store.js';
import { summarizeUsage } from './summary.js';

/** Syncs only this profile's sessions into its ledger; removed sessions keep their past usage. */
export function usageService(ctx: MesaContext) {
  const ledger = usageStore(ctx.paths.usage);
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
        const hook = cached.hooks[record.id] ?? { offset: 0, nativeIds: [], changedIds: [] };
        const discovered = new Set(hook.nativeIds);
        const changed = new Set(hook.changedIds);
        const offset = scanHookEvents(ctx.paths.events, record.id, hook.offset, (event) => {
          if (event.agent !== record.agent || !event.agentSessionId) return;
          if (event.event === 'SessionIdentityChanged') changed.add(event.agentSessionId);
          else discovered.add(event.agentSessionId);
        });
        scannedHooks[record.id] = {
          offset,
          nativeIds: [...discovered],
          changedIds: [...changed],
        };
        if ([...changed].some((id) => id !== record.agentSessionId))
          unknown.push({ session: record.id, reason: 'native session identity changed' });
        const nativeIds = new Set([
          ...(record.agentSessionId ? [record.agentSessionId] : []),
          ...previous.map((source) => source.nativeSessionId),
          ...discovered,
        ]);
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
                ? transcriptFile(claudeTranscripts(ctx.deps.home), nativeId)
                : record.agent === 'codex'
                  ? rolloutForThread({ home: ctx.deps.home, env: ctx.deps.env }, nativeId)
                  : undefined;
          if (!file) {
            unknown.push({ session: record.id, reason: `${record.agent} usage is unavailable` });
            continue;
          }
          try {
            const stat = statSync(file);
            const stamp: SourceStamp = {
              session: record.id,
              nativeSessionId: nativeId,
              file,
              size: stat.size,
              mtimeMs: stat.mtimeMs,
              reader: 1,
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
                ? await claudeUsage(file, record.id, nativeId)
                : await codexUsage(file, record.id, nativeId);
            const resumedAt = record.resumedBy
              ? ctx.store.find(record.resumedBy)?.startedAt
              : undefined;
            const until = [record.endedAt, resumedAt]
              .filter((date): date is string => Boolean(date))
              .sort()[0];
            fresh.push(
              ...readings.filter(
                (row) =>
                  Date.parse(row.at) >= Date.parse(record.startedAt) &&
                  (!until || Date.parse(row.at) < Date.parse(until)),
              ),
            );
            scanned[key] = stamp;
          } catch {
            unknown.push({ session: record.id, reason: 'native usage file could not be read' });
          }
        }
      }
      const rows = ledger
        .merge(fresh, scanned, scannedHooks)
        .filter((row) => !session || row.session === session);
      const now = ctx.deps.clock();
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
