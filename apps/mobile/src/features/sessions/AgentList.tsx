import type { PhoneGate, PhoneRow } from '@mesa/core/phone';
import { router } from 'expo-router';
import SquareStack from 'lucide-react-native/icons/square-stack';
import { use } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { SessionRow } from '@/components/SessionRow';
import { SwipeRow } from '@/components/SwipeRow';
import { Text } from '@/components/ui/text';
import { GateRow } from '../gates/GateRow';
import type { Mac } from '../mac/macsContext';
import { AgentFilters } from './AgentFilters';
import {
  filterRows,
  groupRows,
  isGate,
  type Listing,
  type MacUpdate,
  mergeListings,
  type OnMac,
  placeOf,
  projectsOf,
  type RowFilter,
} from './agentRows';
import { agentsEmpty } from './agentsEmpty';
import { OfflineNote } from './OfflineNote';
import { stateColor, stateWords } from './sessionState';

/**
 * Every paired Mac's sessions grouped Needs you (with open decision gates), Working, Done, live,
 * filtered by Mac, project or unread, swiped to mark read or unread.
 */
export function AgentList({
  macs,
  listing,
  updates,
  gates,
  filter,
  onFilter,
  refreshing,
  onRefresh,
  onMark,
}: {
  macs: Pick<Mac, 'id' | 'name'>[];
  listing: Promise<Listing[]>;
  updates: MacUpdate[];
  gates: OnMac<PhoneGate>[];
  filter: RowFilter;
  onFilter: (filter: RowFilter) => void;
  refreshing: boolean;
  onRefresh: () => void;
  onMark: (row: OnMac<PhoneRow>, unread: boolean) => void;
}) {
  const listed = use(listing);
  const rows = mergeListings(listed, updates);
  const several = macs.length > 1;
  const nameOf = (mac: string) => macs.find((m) => m.id === mac)?.name;
  const shownGates = gates.filter((gate) => !filter.mac || gate.mac === filter.mac);
  const now = Date.now();
  return (
    <SectionList
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-background"
      sections={groupRows(filterRows(rows, filter), shownGates)}
      keyExtractor={(item) => `${item.mac}:${item.id}`}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <View className="gap-2 pb-2">
          {listed.map((one) =>
            one.offline ? (
              <View key={one.mac} className="px-4">
                <OfflineNote
                  heardAt={one.offline.heardAt}
                  now={now}
                  name={several ? nameOf(one.mac) : undefined}
                />
              </View>
            ) : null,
          )}
          <AgentFilters
            macs={macs}
            projects={projectsOf(rows)}
            filter={filter}
            onChange={onFilter}
          />
        </View>
      }
      ListEmptyComponent={
        <EmptyState icon={SquareStack} {...agentsEmpty(rows.length, filter.query, several)} />
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
        if (isGate(item)) return <GateRow gate={item} />;
        const toggle = item.unread ? 'Mark read' : 'Mark unread';
        return (
          <SwipeRow action={toggle} onAction={() => onMark(item, !item.unread)}>
            <SessionRow
              row={{
                ...item,
                project: placeOf(item.project, several ? nameOf(item.mac) : undefined),
              }}
              stateColor={stateColor(item.state, item.unread)}
              stateWords={stateWords(item.state)}
              now={now}
              onPress={() =>
                router.push({ pathname: '/agents/[id]', params: { id: item.id, mac: item.mac } })
              }
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
