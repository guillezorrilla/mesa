import type { CallResult } from '@mesa/core/phone';
import { use } from 'react';
import { FlatList, View } from 'react-native';
import { ErrorNote } from '@/components/ErrorNote';
import { Text } from '@/components/ui/text';
import type { MacRead } from '../mac/tryCall';
import { ConversationRow } from './ConversationRow';
import { historyNote } from './historyText';
import { useResume } from './useResume';

/** The past conversations read or found, each opened or resumed by a tap. */
export function HistoryList({
  history,
  query,
}: {
  history: Promise<MacRead<CallResult<'history'>>>;
  query: string;
}) {
  const { result, error } = use(history);
  const conversations = result?.conversations ?? [];
  const partial = result?.partial ?? false;
  const resume = useResume();
  const note = historyNote(query, conversations.length, partial);
  const now = Date.now();
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-background"
      keyboardShouldPersistTaps="handled"
      data={conversations}
      keyExtractor={(c) => `${c.agent}:${c.id}`}
      ListHeaderComponent={
        error ? (
          <View className="px-4">
            <ErrorNote text={error} />
          </View>
        ) : undefined
      }
      renderItem={({ item }) => (
        <ConversationRow conversation={item} now={now} onPress={() => resume(item)} />
      )}
      ListFooterComponent={
        note ? (
          <Text className="px-4 py-6 text-center text-muted-foreground">{note}</Text>
        ) : undefined
      }
    />
  );
}
