import { ScrollView } from 'react-native';
import { Chip } from '@/components/Chip';

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
      {choices.map((choice) => (
        <Chip
          key={choice.value}
          label={choice.label}
          count={choice.count}
          selected={choice.value === value}
          changes={choice.value !== value}
          onPress={() => onChange(choice.value)}
        />
      ))}
    </ScrollView>
  );
}
