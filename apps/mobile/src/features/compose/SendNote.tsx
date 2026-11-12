import type { SendResult } from '@mesa/core/phone';
import { View } from 'react-native';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { sendNoteText } from './sendNoteText';

/**
 * What the last send came to: an error, the guardrail's block (no override from here), its ask
 * with Send anyway, or a queued reply.
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
  if (outcome.result?.status === 'blocked') return <ErrorNote text={text} />;
  return (
    <View className="flex-row items-center gap-3">
      <Text variant="muted" className="flex-1">
        {text}
      </Text>
      {outcome.result?.status === 'ask' ? (
        <Button size="sm" variant="outline" onPress={onSendAnyway}>
          <Text>Send anyway</Text>
        </Button>
      ) : null}
    </View>
  );
}
