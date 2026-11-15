import { View } from 'react-native';
import { Chip } from '@/components/Chip';

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
        <Chip
          key={choice}
          label={words}
          selected={choice === value}
          changes={choice !== value}
          onPress={() => onChange(choice)}
        />
      ))}
    </View>
  );
}
