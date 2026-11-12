import { type ReactNode, Suspense } from 'react';
import { View } from 'react-native';
import { BusyLine } from '@/components/BusyLine';
import { Screen } from '@/components/Screen';
import { TicketList } from './TicketList';
import { useTickets } from './useTickets';

/** `project`'s followed tickets under `header`, pulled to read again; key it by project. */
export function ProjectTickets({ project, header }: { project: string; header: ReactNode }) {
  const { tickets, refresh, refreshing } = useTickets(project);
  return (
    <Suspense
      fallback={
        <Screen className="px-0">
          {header}
          <View className="px-4">
            <BusyLine label="Reading its tickets..." />
          </View>
        </Screen>
      }
    >
      <TicketList
        project={project}
        tickets={tickets}
        header={header}
        refreshing={refreshing}
        onRefresh={refresh}
      />
    </Suspense>
  );
}
