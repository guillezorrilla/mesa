import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/** One action under a row: its button's words, and what it does. */
export type RowAction = { label: string; run: () => void };

/**
 * A row with its actions under it, shown by swiping left, the first drawn strongest and the rest
 * quieter toward the edge: tapping one runs it and closes the row. VoiceOver reaches the same
 * actions from the row's actions menu.
 */
export function SwipeRow({ actions, children }: { actions: RowAction[]; children: ReactNode }) {
  return (
    <Swipeable
      friction={2}
      rightThreshold={40}
      renderRightActions={(_progress, _drag, row) => (
        <View className="flex-row">
          {actions.map((action, index) => (
            // Gesture handler's own Pressable: React Native's misses taps inside the swipeable.
            <Pressable
              key={action.label}
              accessibilityRole="button"
              onPress={() => {
                row.close();
                action.run();
              }}
            >
              <View
                className={cn(
                  'h-full w-28 items-center justify-center',
                  index ? 'bg-muted-foreground' : 'bg-primary',
                )}
              >
                <Text
                  className={cn(
                    'font-medium',
                    index ? 'text-background' : 'text-primary-foreground',
                  )}
                >
                  {action.label}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    >
      {children}
    </Swipeable>
  );
}
