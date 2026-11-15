import { ScrollView } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

/**
 * One chip per choice on a row that scrolls sideways, each with how many it holds, the chosen one
 * filled; a press picks it, with selection feedback when the choice changes.
 */
export function CountChips<T extends string>({
  label,
  choices,
  value,
  onChange,
}: {
  /** What is being chosen, for VoiceOver. */
  label: string;
  choices: readonly { value: T; label: string; count: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      accessibilityLabel={label}
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="items-center gap-2 px-4 pt-1 pb-2"
    >
      {choices.map((choice) => {
        const selected = choice.value === value;
        return (
          <Button
            key={choice.value}
            size="sm"
            variant={selected ? 'default' : 'secondary'}
            accessibilityLabel={`${choice.label}, ${choice.count}`}
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) haptic('selection');
              onChange(choice.value);
            }}
          >
            <Text>{choice.label}</Text>
            <Text className={cn('tabular-nums', selected ? 'opacity-70' : 'text-muted-foreground')}>
              {choice.count}
            </Text>
          </Button>
        );
      })}
    </ScrollView>
  );
}
