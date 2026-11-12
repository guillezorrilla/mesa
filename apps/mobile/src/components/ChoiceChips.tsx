import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

/** One chip per choice, wrapping onto more lines as needed, the chosen one filled; a press picks it. */
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
          onPress={() => onChange(choice)}
        >
          <Text>{words}</Text>
        </Button>
      ))}
    </View>
  );
}
