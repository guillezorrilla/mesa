import type { CallResult, PhoneNotice } from '@mesa/core/phone';
import Inbox from 'lucide-react-native/icons/inbox';
import { type ReactNode, use } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { ErrorNote } from '@/components/ErrorNote';
import { SwipeRow } from '@/components/SwipeRow';
import { Separator } from '@/components/ui/separator';
import type { MacRead } from '../mac/tryCall';
import { NoticeRow } from './NoticeRow';
import { newestFirst } from './newestFirst';

/**
 * The notices newest first under `header`, as a list pulled to refresh, an unread one swiped to
 * mark it read; a Mac that did not answer says why above them.
 */
export function InboxList({
  answer,
  header,
  refreshing,
  onRefresh,
  onOpen,
  onMarkRead,
}: {
  answer: Promise<MacRead<CallResult<'inbox'>>>;
  header: ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (notice: PhoneNotice) => void;
  onMarkRead: (notice: PhoneNotice) => void;
}) {
  const { result, error } = use(answer);
  const now = Date.now();
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-background"
      data={newestFirst(result?.notices ?? [])}
      keyExtractor={(notice) => notice.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ItemSeparatorComponent={() => <Separator className="ml-16" />}
      ListHeaderComponent={
        <>
          {header}
          {error ? (
            <View className="p-4">
              <ErrorNote text={error} />
            </View>
          ) : null}
        </>
      }
      ListEmptyComponent={
        result ? (
          <EmptyState
            icon={Inbox}
            title="Nothing in your Inbox"
            line="When a session needs you, a crew finishes or Mesa has news, it lands here."
          />
        ) : undefined
      }
      renderItem={({ item }) => {
        if (item.read) return <NoticeRow notice={item} now={now} onOpen={() => onOpen(item)} />;
        return (
          <SwipeRow actions={[{ label: 'Mark read', run: () => onMarkRead(item) }]}>
            <NoticeRow
              notice={item}
              now={now}
              onOpen={() => onOpen(item)}
              onMarkRead={() => onMarkRead(item)}
            />
          </SwipeRow>
        );
      }}
    />
  );
}
