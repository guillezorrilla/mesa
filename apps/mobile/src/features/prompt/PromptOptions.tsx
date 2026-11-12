import type { PhonePrompt } from '@mesa/core/phone';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

type Option = Extract<PhonePrompt, { status: 'pending' }>['options'][number];

/** A prompt's options as buttons, the first filled, each with its description under it. */
export function PromptOptions({
  options,
  disabled,
  onChoose,
}: {
  options: Option[];
  disabled: boolean;
  onChoose: (option: string) => void;
}) {
  return (
    <View className="gap-3">
      {options.map((option, index) => (
        <View key={option.id} className="gap-1">
          <Button
            variant={index === 0 ? 'default' : 'secondary'}
            disabled={disabled}
            accessibilityHint={option.description}
            onPress={() => onChoose(option.id)}
          >
            <Text>{option.label}</Text>
          </Button>
          {option.description ? <Text variant="muted">{option.description}</Text> : null}
        </View>
      ))}
    </View>
  );
}
