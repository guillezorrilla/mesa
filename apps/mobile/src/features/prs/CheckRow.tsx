import type { PhoneCheck } from '@mesa/core/phone';
import { Linking, Pressable } from 'react-native';
import { StateDot } from '@/components/StateDot';
import { Text } from '@/components/ui/text';
import { checkColor } from './prText';

/** One check: its state's dot, name and state; tapped, its details open in the browser. */
export function CheckRow({ check }: { check: PhoneCheck }) {
  const url = check.url;
  return (
    <Pressable
      accessibilityRole={url ? 'link' : undefined}
      accessibilityLabel={`${check.name}, ${check.state}`}
      disabled={!url}
      onPress={url ? () => void Linking.openURL(url) : undefined}
      className="min-h-11 flex-row items-center gap-3 px-4 py-2 active:bg-accent"
    >
      <StateDot color={checkColor(check.state)} />
      <Text numberOfLines={1} className="flex-1 font-mono text-sm">
        {check.name}
      </Text>
      <Text variant="muted">{check.state}</Text>
    </Pressable>
  );
}
