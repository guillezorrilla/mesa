import { type CallResult, groupByStatus } from '@mesa/core/phone';
import { router } from 'expo-router';
import { type ReactNode, use, useState } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import { CountChips } from '@/components/CountChips';
import { ErrorNote } from '@/components/ErrorNote';
import { GroupHeader } from '@/components/GroupHeader';
import { Text } from '@/components/ui/text';
import { keptChoice } from '@/lib/keptChoice';
import { useKept } from '@/lib/useKept';
import type { MacRead } from '../mac/tryCall';
import { StatusIcon } from './StatusIcon';
import { TicketRow } from './TicketRow';
import { noTicketsText } from './ticketText';
import { inView, viewChoices } from './ticketViews';

const capitalized = (status: string) => status.charAt(0).toUpperCase() + status.slice(1);

/**
 * The tickets read, as the Mac app's Tickets tab lists them: the followed views as chips (the
 * picked one kept per project), then the tickets grouped by status, done groups folded at first,
 * under `header` and any view that failed; a tap opens one.
 */
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
  const [view, setView] = useKept(`tickets.view.${project}`);
  // The groups the person opened or closed; the rest are open unless done.
  const [picked, setPicked] = useState<ReadonlyMap<string, boolean>>(new Map());
  const views = result?.views ?? [];
  const all = result?.tickets ?? [];
  const choices = viewChoices(views, all);
  const current = keptChoice(choices, view);
  // A view that lists nothing may say why (a board with no active sprint).
  const empty = views.find((v) => v.name === current)?.note ?? noTicketsText(views.length);
  const problems = [
    ...(error ? [error] : []),
    ...views.flatMap((v) => (v.error ? [`${v.name}: ${v.error}`] : [])),
  ];
  const groups = groupByStatus(inView(all, current)).map((group) => {
    const open = picked.get(group.id) ?? group.category !== 'done';
    return { ...group, open, data: open ? group.rows : [] };
  });
  return (
    <SectionList
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-background"
      sections={groups}
      keyExtractor={(t) => t.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <>
          {header}
          {choices.length ? (
            <CountChips label="View" choices={choices} value={current} onChange={setView} />
          ) : null}
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
          <Text className="px-4 py-8 text-center text-muted-foreground">{empty}</Text>
        )
      }
      renderSectionHeader={({ section }) => (
        <GroupHeader
          mark={<StatusIcon category={section.category} />}
          title={capitalized(section.status)}
          count={section.rows.length}
          open={section.open}
          onToggle={() => setPicked(new Map(picked).set(section.id, !section.open))}
        />
      )}
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
