import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * A tab's root with no navigation bar: its list starts right under the status bar, which keeps
 * the background behind it so rows never scroll under the clock.
 */
export function TabScreen({ children }: { children: ReactNode }) {
  const { top } = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: top }} className="flex-1 bg-background">
      {children}
    </View>
  );
}
