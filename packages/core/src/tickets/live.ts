import type { MesaContext } from '../context.js';
import { PROVIDER_IDS, ticketId } from './providers.js';

/**
 * The live sessions started from each ticket, in any project, by its provider and the item id its
 * import gave it (itemIdOfKey): jira:LC-12, github:owner/repo/12.
 */
export function liveSessions(ctx: MesaContext) {
  const by = new Map<string, { id: string; project: string }[]>();
  for (const record of ctx.store.readable()) {
    const provider = PROVIDER_IDS.find((p) => p === record.from?.source);
    if (!provider || !record.from || record.endedAt) continue;
    const id = ticketId(provider, record.from.id);
    by.set(id, [...(by.get(id) ?? []), { id: record.id, project: record.project }]);
  }
  return by;
}
