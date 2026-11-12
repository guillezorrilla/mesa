import type { PhoneRow, UpdateMessage } from '@mesa/core/phone';
import { router } from 'expo-router';
import { use } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import { SessionRow } from '@/components/SessionRow';
import { SwipeRow } from '@/components/SwipeRow';
import { Text } from '@/components/ui/text';
import { AgentFilters } from './AgentFilters';
import { applyUpdates, filterRows, groupRows, projectsOf, type RowFilter } from './agentRows';
import { OfflineNote } from './OfflineNote';
import { stateColor, stateWords } from './sessionState';
import type { Listing } from './useAgents';

/** The sessions grouped Needs you, Working, Done, live, filtered, swiped to mark read or unread. */
export function AgentList({
  listing,
  updates,
  filter,
  onFilter,
  refreshing,
  onRefresh,
  onMark,
  heardAt,
}: {
  listing: Promise<Listing>;
  updates: (UpdateMessage & { at: number })[];
  filter: RowFilter;
  onFilter: (filter: RowFilter) => void;
  refreshing: boolean;
  onRefresh: () => void;
  onMark: (row: PhoneRow, unread: boolean) => void;
  heardAt: number | undefined;
}) {
  const listed = use(listing);
  // Updates older than the listing are already in it.
  const rows = applyUpdates(
    listed.rows,
    updates.filter((update) => update.at > listed.at),
  );
  const now = Date.now();
  return (
    <SectionList
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-background"
      sections={groupRows(filterRows(rows, filter))}
      keyExtractor={(row) => row.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <View className="gap-2 pb-2">
          {listed.offline ? (
            <View className="px-4">
              <OfflineNote heardAt={heardAt} now={now} />
            </View>
          ) : null}
          <AgentFilters projects={projectsOf(rows)} filter={filter} onChange={onFilter} />
        </View>
      }
      ListEmptyComponent={
        <Text className="px-4 py-8 text-center text-muted-foreground">
          {rows.length ? 'No session matches.' : 'No sessions on your Mac.'}
        </Text>
      }
      renderSectionHeader={({ section }) => (
        <Text
          accessibilityRole="header"
          className="bg-background px-4 pt-4 pb-1 text-sm font-semibold text-muted-foreground"
        >
          {section.title}
        </Text>
      )}
      renderItem={({ item }) => {
        const toggle = item.unread ? 'Mark read' : 'Mark unread';
        return (
          <SwipeRow action={toggle} onAction={() => onMark(item, !item.unread)}>
            <SessionRow
              row={item}
              stateColor={stateColor(item.state, item.unread)}
              stateWords={stateWords(item.state)}
              now={now}
              onPress={() => router.push(`/agents/${item.id}`)}
              actions={[
                { name: 'toggleUnread', label: toggle, run: () => onMark(item, !item.unread) },
              ]}
            />
          </SwipeRow>
        );
      }}
    />
  );
}
