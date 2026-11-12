import type { GateAdvice } from '@mesa/core/phone';
import { startTransition } from 'react';
import { View } from 'react-native';
import { OptionButton } from './OptionButton';

/** One button per option of an open gate, each with its odds; a press resolves the gate. */
export function GateOptions({
  options,
  advice,
  busy,
  onPick,
}: {
  options: readonly string[];
  advice: GateAdvice;
  busy: boolean;
  onPick: (option: string) => void;
}) {
  return (
    <View className="gap-2">
      {options.map((option) => (
        <OptionButton
          key={option}
          option={option}
          p={advice.odds.find((odds) => odds.option === option)?.p}
          advised={advice.status === 'accepted' && advice.pick === option}
          disabled={busy}
          onPress={() => startTransition(() => onPick(option))}
        />
      ))}
    </View>
  );
}
