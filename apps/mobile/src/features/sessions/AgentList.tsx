import type { PhoneGate, PhoneRow } from '@mesa/core/phone';
import { router } from 'expo-router';
import Bot from 'lucide-react-native/icons/bot';
import { type ReactNode, use } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { GroupHeader } from '@/components/GroupHeader';
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
  offeredFilter,
  placeOf,
  projectsOf,
  type RowFilter,
} from './agentRows';
import { agentsEmpty } from './agentsEmpty';
import { OfflineNote } from './OfflineNote';
import { rowActions } from './rowActions';
import { stateColor, stateWords } from './sessionState';

/**
 * Every paired Mac's sessions under `header`, grouped Needs you (with open decision gates), Working, Done, live,
 * filtered by Mac, project or unread, swiped to mark read or unread and, once ended, to archive (rowActions).
 */
export function AgentList({
  header,
  macs,
  listing,
  updates,
  gates,
  filter,
  onFilter,
  refreshing,
  onRefresh,
  onMark,
  onArchive,
}: {
  header: ReactNode;
  macs: Pick<Mac, 'id' | 'name'>[];
  listing: Promise<Listing[]>;
  updates: MacUpdate[];
  gates: OnMac<PhoneGate>[];
  filter: RowFilter;
  onFilter: (filter: RowFilter) => void;
  refreshing: boolean;
  onRefresh: () => void;
  onMark: (row: OnMac<PhoneRow>, unread: boolean) => void;
  onArchive: (row: OnMac<PhoneRow>) => void;
}) {
  const listed = use(listing);
  const rows = mergeListings(listed, updates);
  const several = macs.length > 1;
  const projects = projectsOf(rows);
  const shown = offeredFilter(filter, projects, macs);
  const nameOf = (mac: string) => macs.find((m) => m.id === mac)?.name;
  const shownGates = gates.filter((gate) => !shown.mac || gate.mac === shown.mac);
  const now = Date.now();
  return (
    <SectionList
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-background"
      sections={groupRows(filterRows(rows, shown), shownGates)}
      keyExtractor={(item) => `${item.mac}:${item.id}`}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      // A tap while searching presses what it lands on, instead of only closing the keyboard.
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListHeaderComponent={
        <View className="gap-2 pb-2">
          {header}
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
          <AgentFilters macs={macs} projects={projects} filter={shown} onChange={onFilter} />
        </View>
      }
      ListEmptyComponent={
        <EmptyState icon={Bot} {...agentsEmpty(rows.length, filter.query, several)} />
      }
      renderSectionHeader={({ section }) => (
        <GroupHeader title={section.title} count={section.data.length} />
      )}
      renderItem={({ item }) => {
        if (isGate(item)) return <GateRow gate={item} />;
        const actions = rowActions(item, {
          mark: (unread) => onMark(item, unread),
          archive: () => onArchive(item),
        });
        return (
          <SwipeRow actions={actions}>
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
              actions={actions}
            />
          </SwipeRow>
        );
      }}
    />
  );
}
