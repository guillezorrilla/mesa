import type { LucideIcon } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/** One of a tab header's actions: its mark in a round 44 pt target, named for VoiceOver. */
export function HeaderButton({
  icon,
  label,
  onPress,
  selected = false,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        'size-11 items-center justify-center rounded-full active:bg-accent',
        selected && 'bg-muted',
      )}
    >
      <Icon as={icon} className="size-5 text-foreground" />
    </Pressable>
  );
}
