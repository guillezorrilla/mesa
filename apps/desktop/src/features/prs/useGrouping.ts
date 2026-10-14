import { useState } from 'react';
import { readKept, writeKept } from '@/lib/keptValue';
import type { PrGrouping } from './prGroups';

const KEY = 'mesa.reviews.grouping';

/** The grouping the Reviews list was last shown in, by project until changed, kept across visits. */
export function useGrouping() {
  const [by, setBy] = useState<PrGrouping>(() =>
    readKept(KEY) === 'status' ? 'status' : 'project',
  );
  const choose = (next: PrGrouping) => {
    setBy(next);
    writeKept(KEY, next);
  };
  return [by, choose] as const;
}
