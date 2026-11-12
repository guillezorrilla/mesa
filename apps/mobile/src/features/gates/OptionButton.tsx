import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { percent } from './adviceText';

/**
 * One option of a gate as a button that carries the Decision model's odds for it: a fill behind
 * the label as wide as its probability, the percent in mono, the model's pick in the waiting tone.
 */
export function OptionButton({
  option,
  p,
  advised,
  disabled,
  onPress,
}: {
  option: string;
  p?: number;
  advised: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const odds = p === undefined ? '' : `, ${percent(p)}${advised ? ', advised' : ''}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Pick ${option}${odds}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'min-h-14 justify-center overflow-hidden rounded-xl border bg-background active:bg-accent',
        advised ? 'border-state-waiting' : 'border-border',
        disabled && 'opacity-50',
      )}
    >
      {p === undefined ? null : (
        <View
          accessible={false}
          className={cn('absolute inset-y-0 left-0', advised ? 'bg-state-waiting/15' : 'bg-muted')}
          style={{ width: percent(p) as `${number}%` }}
        />
      )}
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Text className={cn('flex-1', advised && 'font-semibold')}>{option}</Text>
        {p === undefined ? null : (
          <Text className="font-mono text-sm text-muted-foreground">{percent(p)}</Text>
        )}
      </View>
    </Pressable>
  );
}
