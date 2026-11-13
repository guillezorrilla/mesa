import ShieldQuestion from 'lucide-react-native/icons/shield-question';
import { View } from 'react-native';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { startNoteText } from './startForm';
import type { StartOutcome } from './useStart';

/** What the last start came to: an error, the guardrail's block, or its ask with Start anyway. */
export function StartNote({
  outcome,
  onStartAnyway,
}: {
  outcome: StartOutcome;
  onStartAnyway: () => void;
}) {
  if (outcome.error) return <ErrorNote text={outcome.error} />;
  const text = outcome.result && startNoteText(outcome.result);
  if (!text) return null;
  if (outcome.result?.status === 'blocked') return <ErrorNote text={text} />;
  return (
    <View className="gap-3 rounded-xl border border-state-waiting/40 bg-state-waiting/10 p-3">
      <View accessible accessibilityRole="alert" className="flex-row gap-2">
        <Icon as={ShieldQuestion} className="mt-0.5 size-5 text-state-waiting" />
        <Text className="shrink">{text}</Text>
      </View>
      <Button size="sm" variant="outline" className="self-end" onPress={onStartAnyway}>
        <Text>Start anyway</Text>
      </Button>
    </View>
  );
}
