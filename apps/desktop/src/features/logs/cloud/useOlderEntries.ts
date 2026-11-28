import type { CloudLogEntry } from '@mesa/core';
import { useMemo, useState } from 'react';
import type { CloudFilters } from '@/lib/client/logs';
import { useCall } from '@/lib/useCommand';

const NONE: { entries: CloudLogEntry[]; end: boolean } = { entries: [], end: false };

/**
 * Pages back past `first` (the newest entries a read gave): each Load older reads `page` more
 * before the oldest shown with `filters`; `end` once a page comes back short. Kept per `first`.
 */
export function useOlderEntries(
  first: readonly CloudLogEntry[] | undefined,
  filters: CloudFilters,
  page = 50,
) {
  const call = useCall();
  const [older, setOlder] = useState<{
    of?: readonly CloudLogEntry[];
    entries: CloudLogEntry[];
    end: boolean;
  }>({ entries: [], end: false });
  const [busy, setBusy] = useState(false);
  const mine = older.of === first ? older : NONE;
  const entries = useMemo(() => [...(first ?? []), ...mine.entries], [first, mine.entries]);
  return {
    entries,
    busy,
    end: mine.end || (first?.length ?? 0) < page,
    loadOlder: async () => {
      const before = entries.at(-1)?.time;
      if (!before) return;
      setBusy(true);
      const next = await call('logs.gcp', { ...filters, before, limit: page });
      setBusy(false);
      if (next.ok)
        setOlder({
          of: first,
          entries: [...mine.entries, ...next.data.entries],
          end: next.data.entries.length < page,
        });
    },
  };
}
