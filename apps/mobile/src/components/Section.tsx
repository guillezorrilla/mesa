import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';

/** A titled part of a screen: a small muted heading over its content. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="text-sm font-semibold text-muted-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
}
