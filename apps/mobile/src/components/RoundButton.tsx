import type { LucideIcon } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * A round raised button with one mark, as orca's bar and composer draw theirs (NavBarButton,
 * ComposerSendButton): 36 pt with a 44 pt target, bright while `selected` or `bright`.
 */
export function RoundButton({
  icon,
  label,
  onPress,
  selected = false,
  bright = selected,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  selected?: boolean;
  bright?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      className={cn(
        'size-9 items-center justify-center rounded-full active:opacity-70',
        bright ? 'bg-primary' : 'bg-secondary',
      )}
    >
      <Icon
        as={icon}
        className={cn(
          'size-[18px]',
          bright
            ? 'text-primary-foreground'
            : disabled
              ? 'text-muted-foreground'
              : 'text-foreground',
        )}
      />
    </Pressable>
  );
}
