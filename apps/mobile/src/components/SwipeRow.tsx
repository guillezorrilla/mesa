import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Text } from '@/components/ui/text';

/**
 * A row with one action under it, shown by swiping left: tapping the action runs it and closes
 * the row. VoiceOver reaches the same action from the row's actions menu.
 */
export function SwipeRow({
  action,
  onAction,
  children,
}: {
  action: string;
  onAction: () => void;
  children: ReactNode;
}) {
  return (
    <Swipeable
      friction={2}
      rightThreshold={40}
      renderRightActions={(_progress, _drag, row) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            row.close();
            onAction();
          }}
          className="w-28 items-center justify-center bg-primary"
        >
          <Text className="font-medium text-primary-foreground">{action}</Text>
        </Pressable>
      )}
    >
      {children}
    </Swipeable>
  );
}
