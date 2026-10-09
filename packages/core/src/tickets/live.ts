import type { MesaContext } from '../context.js';

/** The live sessions started from each Jira key, in any project of the profile. */
export function liveSessions(ctx: MesaContext) {
  const by = new Map<string, { id: string; project: string }[]>();
  for (const record of ctx.store.list()) {
    if (record.from?.source !== 'jira' || record.endedAt) continue;
    by.set(record.from.id, [
      ...(by.get(record.from.id) ?? []),
      { id: record.id, project: record.project },
    ]);
  }
  return by;
}
