import type { LucideIcon } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * One of a header's actions: its mark in a round 44 pt target, named for VoiceOver. `filled`, a
 * session bar's 36 pt raised button as orca draws it (NavBarButton), turns bright while `selected`.
 */
export function HeaderButton({
  icon,
  label,
  onPress,
  selected = false,
  filled = false,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  selected?: boolean;
  filled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={filled ? 4 : undefined}
      className={cn(
        'items-center justify-center rounded-full',
        filled
          ? cn('size-9 bg-secondary active:opacity-70', selected && 'bg-primary')
          : cn('size-11 active:bg-accent', selected && 'bg-muted'),
      )}
    >
      <Icon
        as={icon}
        className={cn(
          filled ? 'size-[18px]' : 'size-5',
          filled && selected ? 'text-primary-foreground' : 'text-foreground',
        )}
      />
    </Pressable>
  );
}
