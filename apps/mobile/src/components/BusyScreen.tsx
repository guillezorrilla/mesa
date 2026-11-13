import type { ReactNode } from 'react';
import { BusyLine } from './BusyLine';
import { Screen } from './Screen';

/**
 * A whole screen waiting on something, said in one line: a Suspense fallback. `header` is what
 * the list it stands in for keeps above its rows (a tab's title, Work's switch, a project's chips).
 */
export function BusyScreen({ label, header }: { label: string; header?: ReactNode }) {
  return (
    <Screen header={header}>
      <BusyLine label={label} />
    </Screen>
  );
}
