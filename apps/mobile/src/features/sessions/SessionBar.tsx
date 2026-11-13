import type { PhoneRow } from '@mesa/core/phone';
import { router } from 'expo-router';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RoundButton } from '@/components/RoundButton';
import { StateDot } from '@/components/StateDot';
import { Text } from '@/components/ui/text';
import { stateColor, stateWords } from './sessionState';

// Asked on the tap: read while rendering, it can be stale. A session opened alone goes to the list.
const back = () => (router.canGoBack() ? router.back() : router.replace('/agents'));

/**
 * A session's own top bar, opaque as orca's (MobileSessionHeader): back, its title over its state,
 * and its actions (`children`); `row` is missing while the session is read.
 */
export function SessionBar({ row, children }: { row?: PhoneRow; children?: ReactNode }) {
  const { top } = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: top }} className="border-b border-border bg-card">
      <View className="h-13 flex-row items-center gap-2 px-3">
        <View className="flex-1 flex-row">
          <RoundButton icon={ChevronLeft} label="Back" onPress={back} />
        </View>
        {row ? (
          <View className="max-w-[62%] shrink items-center">
            <Text accessibilityRole="header" numberOfLines={1} className="font-semibold">
              {row.title}
            </Text>
            <View className="flex-row items-center gap-1.5">
              <StateDot color={stateColor(row.state, row.unread)} className="size-2" />
              <Text numberOfLines={1} className="text-xs text-muted-foreground">
                {stateWords(row.state)}
              </Text>
            </View>
          </View>
        ) : null}
        <View className="flex-1 flex-row justify-end gap-2">{children}</View>
      </View>
    </View>
  );
}
