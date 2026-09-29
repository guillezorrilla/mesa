import { claudeTranscripts } from '../agents/claude/paths.js';
import { transcriptFile } from '../agents/claude/transcripts.js';
import { rolloutForThread } from '../agents/codex/rollouts.js';
import type { MesaContext } from '../context.js';
import { readHookEvents } from '../sessions/hook-events.js';
import { claudeUsage } from './claude.js';
import { codexUsage } from './codex.js';
import type { UsageRecord } from './records.js';
import { usageStore } from './store.js';
import { summarizeUsage } from './summary.js';

/** Syncs only this profile's sessions into its ledger; removed sessions keep their past usage. */
export function usageService(ctx: MesaContext) {
  const ledger = usageStore(ctx.paths.usage);
  return {
    list: async (session?: string) => {
      const fresh: UsageRecord[] = [];
      const unknown: { session: string; reason: string }[] = [];
      for (const record of ctx.store.list()) {
        if (session && record.id !== session) continue;
        if (record.agent === 'terminal') continue;
        const nativeIds = new Set([
          ...(record.agentSessionId ? [record.agentSessionId] : []),
          ...readHookEvents(ctx.paths.events, record.id)
            .filter((event) => event.agent === record.agent)
            .flatMap((event) => (event.agentSessionId ? [event.agentSessionId] : [])),
        ]);
        if (nativeIds.size === 0) {
          unknown.push({ session: record.id, reason: 'native session id is not available' });
          continue;
        }
        for (const nativeId of nativeIds) {
          const file =
            record.agent === 'claude'
              ? transcriptFile(claudeTranscripts(ctx.deps.home), nativeId)
              : record.agent === 'codex'
                ? rolloutForThread({ home: ctx.deps.home, env: ctx.deps.env }, nativeId)
                : undefined;
          if (!file) {
            unknown.push({ session: record.id, reason: `${record.agent} usage is unavailable` });
            continue;
          }
          try {
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
          } catch {
            unknown.push({ session: record.id, reason: 'native usage file could not be read' });
          }
        }
      }
      const rows = ledger.merge(fresh).filter((row) => !session || row.session === session);
      return { rows, unknown, ...summarizeUsage(rows, ctx.deps.clock()) };
    },
  };
}
