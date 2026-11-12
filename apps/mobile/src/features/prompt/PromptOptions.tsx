import type { PhonePrompt } from '@mesa/core/phone';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

type Option = Extract<PhonePrompt, { status: 'pending' }>['options'][number];

/**
 * A prompt's options as buttons, each with its description inside; `lead` fills the first (a
 * permission's Allow), while a question's answers stand level.
 */
export function PromptOptions({
  options,
  lead,
  disabled,
  onChoose,
}: {
  options: Option[];
  lead: boolean;
  disabled: boolean;
  onChoose: (option: string) => void;
}) {
  return (
    <View className="gap-2">
      {options.map((option, index) => (
        <Button
          key={option.id}
          variant={lead && index === 0 ? 'default' : 'outline'}
          className={option.description ? 'flex-col items-start gap-0.5 py-3' : undefined}
          disabled={disabled}
          accessibilityLabel={[option.label, option.description].filter(Boolean).join(', ')}
          onPress={() => onChoose(option.id)}
        >
          <Text>{option.label}</Text>
          {option.description ? (
            <Text className="font-normal text-sm text-muted-foreground">{option.description}</Text>
          ) : null}
        </Button>
      ))}
    </View>
  );
}
