import Play from 'lucide-react-native/icons/play';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { StartNote } from './StartNote';
import type { StartOutcome } from './useStart';

/** The bar under the form: the guardrail's note, the launch line, and Start. */
export function StartBar({
  line,
  ready,
  starting,
  outcome,
  onStart,
  onStartAnyway,
}: {
  line: string;
  ready: boolean;
  starting: boolean;
  outcome: StartOutcome;
  onStart: () => void;
  onStartAnyway: () => void;
}) {
  return (
    <View className="gap-3 border-t border-border bg-background px-4 py-3">
      <StartNote outcome={outcome} onStartAnyway={onStartAnyway} />
      <Text
        numberOfLines={2}
        className="font-mono text-xs text-muted-foreground"
        accessibilityLabel={`Starts ${line}`}
      >
        {line}
      </Text>
      <Button onPress={onStart} disabled={!ready} className="rounded-full">
        <Icon as={Play} className="size-4 text-primary-foreground" />
        <Text>{starting ? 'Starting...' : 'Start session'}</Text>
      </Button>
    </View>
  );
}
