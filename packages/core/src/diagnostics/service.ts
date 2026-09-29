import type { MesaContext } from '../context.js';
import { redactPayload } from '../lib/redact.js';
import { MesaError } from '../lib/result.js';
import { readHookEvents } from '../sessions/hook-events.js';

export type DiagnosticEvent = {
  id: string;
  at: string;
  session: string;
  agent: string;
  event: string;
};
export type DiagnosticReport = { events: DiagnosticEvent[]; total: number; limit: number };

/** Bounded local hook metadata for Doctor; provider content never enters this view. */
export function diagnosticsService(ctx: MesaContext) {
  return {
    list: (
      filter: { session?: string; agent?: string; event?: string; limit?: number } = {},
    ): DiagnosticReport => {
      const limit = filter.limit ?? 100;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)
        throw new MesaError('usage', 'diagnostics limit must be 1-200');
      const records = filter.session ? [ctx.store.get(filter.session)] : ctx.store.list();
      const secrets = ctx.secrets();
      const events = records
        .flatMap((record) =>
          readHookEvents(ctx.paths.events, record.id, 256 * 1024).flatMap((entry, index) => {
            if (
              !Number.isFinite(Date.parse(entry.at)) ||
              !AgentSchema.safeParse(entry.agent).success ||
              typeof entry.event !== 'string'
            )
              return [];
            const event = redactPayload(entry.event, ctx.deps.home, secrets, 80) as string;
            return [
              {
                id: `${record.id}:${index}`,
                at: entry.at,
                session: record.id,
                agent: entry.agent,
                event,
              },
            ];
          }),
        )
        .filter(
          (entry) =>
            (!filter.agent || entry.agent === filter.agent) &&
            (!filter.event || entry.event.toLowerCase().includes(filter.event.toLowerCase())),
        )
        .sort((a, b) => b.at.localeCompare(a.at));
      // ponytail: scans the last 256 KiB of each hook log; add an index for older filtered events.
      return { events: events.slice(0, limit), total: events.length, limit };
    },
  };
}

import { AgentSchema } from '../agents/agents.js';
