import type { CallResult } from '@mesa/core/phone';
import { router } from 'expo-router';
import { type ReactNode, use } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { ErrorNote } from '@/components/ErrorNote';
import { Text } from '@/components/ui/text';
import type { MacRead } from '../mac/tryCall';
import { TicketRow } from './TicketRow';
import { noTicketsText } from './ticketText';

/** The tickets read, under `header` and any view that failed; a tap opens one. */
export function TicketList({
  project,
  tickets,
  header,
  refreshing,
  onRefresh,
}: {
  project: string;
  tickets: Promise<MacRead<CallResult<'tickets'>>>;
  header: ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { result, error } = use(tickets);
  const views = result?.views ?? [];
  const problems = [
    ...(error ? [error] : []),
    ...views.flatMap((v) => (v.error ? [`${v.name}: ${v.error}`] : [])),
  ];
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-background"
      data={result?.tickets ?? []}
      keyExtractor={(t) => t.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <>
          {header}
          {problems.length ? (
            <View className="gap-2 px-4 pb-2">
              {problems.map((p) => (
                <ErrorNote key={p} text={p} />
              ))}
            </View>
          ) : null}
        </>
      }
      ListEmptyComponent={
        error ? undefined : (
          <Text className="px-4 py-8 text-center text-muted-foreground">
            {noTicketsText(views.length)}
          </Text>
        )
      }
      renderItem={({ item }) => (
        <TicketRow
          ticket={item}
          onPress={() =>
            router.push({
              pathname: '/work/ticket',
              params: { id: item.id, project, ...(item.site ? { site: item.site } : {}) },
            })
          }
        />
      )}
    />
  );
}
