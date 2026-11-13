import type { ReactNode } from 'react';
import { View } from 'react-native';
import { BusyLine } from './BusyLine';
import { Screen } from './Screen';

/**
 * A whole screen waiting on something, said in one line: a Suspense fallback. `header` is what
 * the list it stands in for keeps above its rows (Work's switch, a project's chips), edge to edge.
 */
export function BusyScreen({ label, header }: { label: string; header?: ReactNode }) {
  if (!header)
    return (
      <Screen>
        <BusyLine label={label} />
      </Screen>
    );
  return (
    <Screen className="px-0">
      {header}
      <View className="px-4">
        <BusyLine label={label} />
      </View>
    </Screen>
  );
}
