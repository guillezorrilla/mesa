import { use } from 'react';
import { FlatList, View } from 'react-native';
import { ErrorNote } from '@/components/ErrorNote';
import { Text } from '@/components/ui/text';
import { ConversationRow } from './ConversationRow';
import { historyNote } from './historyText';
import type { HistoryRead } from './useHistory';
import { useResume } from './useResume';

/** The past conversations read or found, each opened or resumed by a tap. */
export function HistoryList({ history }: { history: Promise<HistoryRead> }) {
  const { conversations, partial, query, error } = use(history);
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
