import type { PhoneStep } from '@mesa/core/phone';
import { ActivityIndicator, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { Text } from '@/components/ui/text';
import { liveWords } from './stepWords';

/**
 * What a working agent is doing now, at the bottom of its chat, as orca's live line: a spinner in
 * the 15 pt slot a step's mark takes, a muted verb and its target on one line, so it turns into its
 * finished step row (StepRun) without moving; "Working" when the Mac names no `step`.
 */
export function LiveLine({ step }: { step?: PhoneStep }) {
  const muted = useCSSVariable('--color-muted-foreground') as string;
  const { verb, target } = liveWords(step);
  return (
    <View
      accessible
      accessibilityLabel={target ? `${verb} ${target}` : verb}
      accessibilityLiveRegion="polite"
      className="min-h-8 flex-row items-center gap-2"
    >
      {/* The spinner is wider than a mark; scaled into its slot it keeps the text column. */}
      <View className="w-[15px] items-center">
        <ActivityIndicator size="small" color={muted} className="scale-75" />
      </View>
      <Text numberOfLines={1} className="shrink text-sm">
        <Text className="text-sm text-muted-foreground">{verb}</Text>
        {target ? ` ${target}` : null}
      </Text>
    </View>
  );
}
