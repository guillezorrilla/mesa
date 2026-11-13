import type { LucideIcon } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/** One key of the key row: a mono label or an icon on a keycap, filled while `on` (a held Ctrl). */
export function KeyCap({
  label,
  icon,
  name,
  on = false,
  onPress,
}: {
  label?: string;
  icon?: LucideIcon;
  /** What VoiceOver says. */
  name: string;
  on?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      className={cn(
        'h-10 min-w-0 flex-1 items-center justify-center rounded-lg border border-border bg-card active:bg-accent',
        on && 'border-primary bg-primary active:bg-primary',
      )}
    >
      {icon ? (
        <Icon as={icon} className={cn('size-4 text-foreground', on && 'text-primary-foreground')} />
      ) : (
        <Text className={cn('font-mono text-xs text-foreground', on && 'text-primary-foreground')}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
