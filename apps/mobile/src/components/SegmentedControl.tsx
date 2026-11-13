import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

/** A row of two or three choices, one picked, as iOS's segmented control draws it and taps. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <View
      accessibilityRole="tablist"
      className={cn('flex-row rounded-lg bg-muted p-0.5', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) haptic('selection');
              onChange(option.value);
            }}
            className={cn(
              'min-h-9 flex-1 items-center justify-center rounded-md px-3',
              selected && 'bg-background shadow-sm shadow-black/10',
            )}
          >
            <Text className={cn('text-sm', selected ? 'font-semibold' : 'text-muted-foreground')}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
