import { Stack } from 'expo-router';
import { Suspense, useState } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { AgentList } from './AgentList';
import type { RowFilter } from './agentRows';
import { useAgents } from './useAgents';

/** The Agents tab: every session on the Mac, searched and filtered, live while it is open. */
export function AgentsScreen() {
  const agents = useAgents();
  const [filter, setFilter] = useState<RowFilter>({ query: '', unreadOnly: false });
  return (
    <>
      <Stack.SearchBar
        placeholder="Search sessions"
        onChangeText={(event) => setFilter((f) => ({ ...f, query: event.nativeEvent.text }))}
      />
      <Suspense fallback={<BusyScreen label="Asking your Mac..." />}>
        <AgentList
          listing={agents.listing}
          updates={agents.updates}
          gates={agents.gates}
          filter={filter}
          onFilter={setFilter}
          refreshing={agents.refreshing}
          onRefresh={agents.refresh}
          onMark={agents.mark}
        />
      </Suspense>
    </>
  );
}
