import type { SendResult } from '@mesa/core/phone';
import Clock from 'lucide-react-native/icons/clock';
import ShieldQuestion from 'lucide-react-native/icons/shield-question';
import { View } from 'react-native';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { sendNoteText } from './sendNoteText';

/**
 * What the last send came to: an error, the guardrail's block (no override from here), its ask
 * with Send anyway, in the waiting colour, or a queued reply.
 */
export function SendNote({
  outcome,
  onSendAnyway,
}: {
  outcome: { result?: SendResult; error?: string };
  onSendAnyway: () => void;
}) {
  if (outcome.error) return <ErrorNote text={outcome.error} />;
  const text = outcome.result && sendNoteText(outcome.result);
  if (!text) return null;
  const status = outcome.result?.status;
  if (status === 'blocked') return <ErrorNote text={text} />;
  if (status === 'queued')
    return (
      <View className="flex-row items-center gap-2" accessible accessibilityLiveRegion="polite">
        <Icon as={Clock} className="size-4 text-muted-foreground" />
        <Text variant="muted">{text}</Text>
      </View>
    );
  return (
    <View
      accessible
      accessibilityRole="alert"
      className="gap-3 rounded-xl border border-state-waiting/40 bg-state-waiting/10 p-3"
    >
      <View className="flex-row gap-2">
        <Icon as={ShieldQuestion} className="mt-0.5 size-5 text-state-waiting" />
        <Text className="shrink">{text}</Text>
      </View>
      <Button size="sm" variant="outline" className="self-end" onPress={onSendAnyway}>
        <Text>Send anyway</Text>
      </Button>
    </View>
  );
}
