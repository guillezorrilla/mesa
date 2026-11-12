import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * A screen with a bar pinned under its content (a reply box, a note form) that rides the keyboard
 * and clears the home indicator: a spacer under the bar follows the keyboard each frame (Expo's
 * keyboard guide), so the content above shrinks however the bar grows.
 */
export function KeyboardScreen({ children, bar }: { children: ReactNode; bar: ReactNode }) {
  const { bottom } = useSafeAreaInsets();
  // The keyboard's lift, negative while it shows.
  const { height } = useReanimatedKeyboardAnimation();
  const spacer = useAnimatedStyle(() => ({ height: Math.max(-height.value, bottom) }));
  return (
    <View className="flex-1 bg-background">
      {children}
      {bar}
      <Animated.View style={spacer} />
    </View>
  );
}
