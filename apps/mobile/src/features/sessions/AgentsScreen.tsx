import { Suspense, useState } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { useKept } from '@/lib/useKept';
import { AgentList } from './AgentList';
import { AgentsHeader } from './AgentsHeader';
import { keptFilter, type RowFilter } from './agentRows';
import { useAgents } from './useAgents';

/**
 * The Agents tab: every session on every paired Mac, searched and filtered, live while it is open;
 * the Mac, project and unread chips picked are kept across visits, the search is not.
 */
export function AgentsScreen() {
  const agents = useAgents();
  const [query, setQuery] = useState('');
  const [kept, keep] = useKept('agents.filter');
  const filter: RowFilter = { ...keptFilter(kept), query };
  const setFilter = ({ query: next, ...chips }: RowFilter) => {
    setQuery(next);
    keep(JSON.stringify(chips));
  };
  const header = <AgentsHeader query={query} onQuery={setQuery} />;
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
        onArchive={agents.archive}
      />
    </Suspense>
  );
}
