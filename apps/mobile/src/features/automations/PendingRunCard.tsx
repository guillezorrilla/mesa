import { type PhoneRun, shortAgo } from '@mesa/core/phone';
import Hand from 'lucide-react-native/icons/hand';
import { startTransition } from 'react';
import { View } from 'react-native';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useRunAction } from './useRunAction';

/** A run of a rule that asks first: what it will do, and Approve or Cancel. */
export function PendingRunCard({
  run,
  sentence,
  onDone,
}: {
  run: PhoneRun;
  /** Its rule's sentence, while the rule is still listed. */
  sentence?: string;
  onDone: () => void;
}) {
  const [state, act, acting] = useRunAction(run.id, onDone);
  const press = (choice: 'approve' | 'cancel') => () => startTransition(() => act(choice));
  return (
    <View className="gap-3 rounded-xl border border-state-waiting/40 bg-state-waiting/10 p-4">
      <View className="flex-row items-center gap-2">
        <Icon as={Hand} className="size-4 text-state-waiting" />
        <Text accessibilityRole="header" className="flex-1 font-semibold" numberOfLines={2}>
          {run.rule}
        </Text>
        <Text variant="muted">{shortAgo(run.at, Date.now())}</Text>
      </View>
      {sentence ? <Text>{sentence}</Text> : null}
      {run.reason ? <Text variant="muted">{run.reason}</Text> : null}
      {state.acted ? (
        <Text accessibilityRole="alert" className="text-state-done">
          {state.acted === 'approve' ? 'Approved. It runs on the next tick.' : 'Cancelled.'}
        </Text>
      ) : (
        <View className="flex-row gap-2">
          <Button
            className="flex-1"
            disabled={acting}
            accessibilityLabel={`Approve ${run.rule}`}
            onPress={press('approve')}
          >
            <Text>{acting ? 'Sending...' : 'Approve'}</Text>
          </Button>
          <Button
            className="flex-1"
            variant="outline"
            disabled={acting}
            accessibilityLabel={`Cancel ${run.rule}`}
            onPress={press('cancel')}
          >
            <Text>Cancel run</Text>
          </Button>
        </View>
      )}
      {state.error ? <ErrorNote text={state.error} /> : null}
    </View>
  );
}
