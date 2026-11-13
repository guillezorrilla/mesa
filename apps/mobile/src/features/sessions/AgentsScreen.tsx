import { Suspense, useState } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { AgentList } from './AgentList';
import { AgentsHeader } from './AgentsHeader';
import type { RowFilter } from './agentRows';
import { useAgents } from './useAgents';

/** The Agents tab: every session on every paired Mac, searched and filtered, live while it is open. */
export function AgentsScreen() {
  const agents = useAgents();
  const [filter, setFilter] = useState<RowFilter>({ query: '', unreadOnly: false });
  const [searching, setSearching] = useState(false);
  const header = (
    <AgentsHeader
      searching={searching}
      onSearching={setSearching}
      query={filter.query}
      onQuery={(query) => setFilter((f) => ({ ...f, query }))}
    />
  );
  return (
    <Suspense fallback={<BusyScreen label="Asking your Mac..." header={header} />}>
      <AgentList
        header={header}
        macs={agents.macs}
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
  );
}
