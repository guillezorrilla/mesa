import { type ReactNode, Suspense } from 'react';
import { View } from 'react-native';
import { BusyLine } from '@/components/BusyLine';
import { Screen } from '@/components/Screen';
import { useMacRead } from '../mac/useMacRead';
import { TicketList } from './TicketList';

/** `project`'s followed tickets under `header`, pulled to read again; key it by project. */
export function ProjectTickets({ project, header }: { project: string; header: ReactNode }) {
  const { answer, pull, refreshing } = useMacRead({ method: 'tickets', project });
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
        tickets={answer}
        header={header}
        refreshing={refreshing}
        onRefresh={pull}
      />
    </Suspense>
  );
}
