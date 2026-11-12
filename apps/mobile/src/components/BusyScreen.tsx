import { BusyLine } from './BusyLine';
import { Screen } from './Screen';

/** A whole screen waiting on something, said in one line: a Suspense fallback. */
export function BusyScreen({ label }: { label: string }) {
  return (
    <Screen>
      <BusyLine label={label} />
    </Screen>
  );
}
