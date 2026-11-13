import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { haptic } from '@/lib/haptics';

/**
 * One chip per choice, wrapping onto more lines as needed, the chosen one filled; a press picks it,
 * with selection feedback when the choice changes, as iOS's segmented control gives.
 */
export function ChoiceChips<T extends string>({
  label,
  choices,
  value,
  onChange,
}: {
  /** What is being chosen, for VoiceOver. */
  label: string;
  choices: readonly (readonly [T, string])[];
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  return (
    <View accessibilityLabel={label} className="flex-row flex-wrap gap-2">
      {choices.map(([choice, words]) => (
        <Button
          key={choice}
          size="sm"
          variant={choice === value ? 'default' : 'secondary'}
          accessibilityState={{ selected: choice === value }}
          onPress={() => {
            if (choice !== value) haptic('selection');
            onChange(choice);
          }}
        >
          <Text>{words}</Text>
        </Button>
      ))}
    </View>
  );
}
