import { startTransition } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

/** One button per option of an open gate; a press resolves it, the buttons off while it does. */
export function GateOptions({
  options,
  busy,
  onPick,
}: {
  options: readonly string[];
  busy: boolean;
  onPick: (option: string) => void;
}) {
  return (
    <View className="gap-2">
      {options.map((option) => (
        <Button
          key={option}
          variant="outline"
          disabled={busy}
          onPress={() => startTransition(() => onPick(option))}
        >
          <Text>{option}</Text>
        </Button>
      ))}
    </View>
  );
}
