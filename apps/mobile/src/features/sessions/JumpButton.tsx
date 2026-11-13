import ArrowDown from 'lucide-react-native/icons/arrow-down';
import { Pressable } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** Floats over the conversation while the person reads older messages: back to the latest. */
export function JumpButton({ fresh, onPress }: { fresh: number; onPress: () => void }) {
  const label = fresh ? `${fresh} new` : 'Latest';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Jump to latest${fresh ? `, ${label}` : ''}`}
      className="absolute bottom-3 flex-row items-center gap-1.5 self-center rounded-full border border-border bg-card px-3.5 py-2 shadow-lg active:opacity-80"
    >
      <Icon as={ArrowDown} className="size-4 text-state-working" />
      <Text className="text-sm font-medium">{label}</Text>
    </Pressable>
  );
}
