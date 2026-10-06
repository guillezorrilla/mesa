import type { MesaContext } from '../context.js';
import { scanHookEvents } from '../sessions/hook-events.js';
import type { SessionRecord } from '../sessions/record.js';
import type { HookStamp } from './store.js';

/**
 * A session's native session ids: its record's, `previous` ones (sources read before), and the
 * ones its hook events name since `hook`'s offset; with the hook stamp to keep, and whether its
 * native identity changed to one Mesa does not know, which makes its usage unknown.
 */
export function sessionNativeIds(
  ctx: Pick<MesaContext, 'paths'>,
  record: SessionRecord,
  hook: HookStamp,
  previous: readonly string[],
) {
  const discovered = new Set(hook.nativeIds);
  const changed = new Set(hook.changedIds);
  const offset = scanHookEvents(ctx.paths.events, record.id, hook.offset, (event) => {
    if (event.agent !== record.agent || !event.agentSessionId) return;
    if (event.event === 'SessionIdentityChanged') changed.add(event.agentSessionId);
    else discovered.add(event.agentSessionId);
  });
  const nativeIds = new Set([
    ...(record.agentSessionId ? [record.agentSessionId] : []),
    ...previous,
    ...discovered,
  ]);
  return {
    nativeIds,
    hook: { offset, nativeIds: [...discovered], changedIds: [...changed] },
    lost: [...changed].some((id) => !nativeIds.has(id)),
  };
}

/**
 * Whether a reading at `at` is the session's: from its start until it ended or was resumed (a
 * resume reads the same native transcript as a new session).
 */
export function sessionWindow(ctx: Pick<MesaContext, 'store'>, record: SessionRecord) {
  const resumedAt = record.resumedBy ? ctx.store.find(record.resumedBy)?.startedAt : undefined;
  const until = [record.endedAt, resumedAt]
    .filter((date): date is string => Boolean(date))
    .sort()[0];
  return (at: string) =>
    Date.parse(at) >= Date.parse(record.startedAt) &&
    (!until || Date.parse(at) < Date.parse(until));
}
