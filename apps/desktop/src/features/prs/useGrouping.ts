import { useKept } from '@/lib/keptValue';
import type { PrGrouping } from './prGroups';

/** The grouping the Reviews list was last shown in, by project until changed, kept across visits. */
export function useGrouping() {
  const [kept, keep] = useKept('mesa.reviews.grouping');
  const by: PrGrouping = kept === 'status' ? 'status' : 'project';
  return [by, (next: PrGrouping) => keep(next)] as const;
}

/** The project groups folded in the Reviews list, kept across visits and restarts. */
export function useClosedGroups() {
  const [kept, keep] = useKept('mesa.reviews.closed');
  let closed: string[] = [];
  try {
    const parsed: unknown = JSON.parse(kept ?? '[]');
    if (Array.isArray(parsed)) closed = parsed.filter((g) => typeof g === 'string');
  } catch {
    // A value this version did not write: start with every group open.
  }
  const toggle = (key: string) =>
    keep(JSON.stringify(closed.includes(key) ? closed.filter((g) => g !== key) : [...closed, key]));
  return [closed, toggle] as const;
}
