import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

/**
 * One choice of a row of chips, filled when selected, with how many it holds when counted; a press
 * gives selection feedback unless `changes` says it picks what is already picked.
 */
export function Chip({
  label,
  count,
  selected,
  changes = true,
  onPress,
}: {
  label: string;
  count?: number;
  selected: boolean;
  changes?: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      size="sm"
      variant={selected ? 'default' : 'secondary'}
      accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
      accessibilityState={{ selected }}
      onPress={() => {
        if (changes) haptic('selection');
        onPress();
      }}
    >
      <Text>{label}</Text>
      {count === undefined ? null : (
        <Text className={cn('tabular-nums', selected ? 'opacity-70' : 'text-muted-foreground')}>
          {count}
        </Text>
      )}
    </Button>
  );
}
