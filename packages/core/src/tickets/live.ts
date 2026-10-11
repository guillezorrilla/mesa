import type { MesaContext } from '../context.js';
import { PROVIDER_IDS, ticketId } from './providers.js';

/** The live sessions started from each ticket, by ticket id (jira:LC-12), in any project. */
export function liveSessions(ctx: MesaContext) {
  const by = new Map<string, { id: string; project: string }[]>();
  for (const record of ctx.store.list()) {
    const provider = PROVIDER_IDS.find((p) => p === record.from?.source);
    if (!provider || !record.from || record.endedAt) continue;
    const id = ticketId(provider, record.from.id);
    by.set(id, [...(by.get(id) ?? []), { id: record.id, project: record.project }]);
  }
  return by;
}
