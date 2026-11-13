import type { CallResult, PhoneNotice } from '@mesa/core/phone';
import { use } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { ErrorNote } from '@/components/ErrorNote';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import type { MacRead } from '../mac/tryCall';
import { NoticeRow } from './NoticeRow';

/** The notices as a list pulled to refresh; a Mac that did not answer says why above them. */
export function InboxList({
  answer,
  refreshing,
  onRefresh,
  onOpen,
}: {
  answer: Promise<MacRead<CallResult<'inbox'>>>;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (notice: PhoneNotice) => void;
}) {
  const { result, error } = use(answer);
  const now = Date.now();
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-background"
      data={result?.notices ?? []}
      keyExtractor={(notice) => notice.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ItemSeparatorComponent={() => <Separator className="ml-14" />}
      ListHeaderComponent={
        error ? (
          <View className="p-4">
            <ErrorNote text={error} />
          </View>
        ) : undefined
      }
      ListEmptyComponent={
        result ? (
          <Text className="px-4 py-8 text-center text-muted-foreground">
            Nothing in your Mac's Inbox.
          </Text>
        ) : undefined
      }
      renderItem={({ item }) => <NoticeRow notice={item} now={now} onOpen={() => onOpen(item)} />}
    />
  );
}
