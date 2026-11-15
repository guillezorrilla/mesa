import { Suspense, useState } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { useKept } from '@/lib/useKept';
import { AgentList } from './AgentList';
import { AgentsHeader } from './AgentsHeader';
import type { RowFilter } from './agentRows';
import { useAgents } from './useAgents';

/**
 * The Agents tab: every session on every paired Mac, searched and filtered, live while it is open;
 * the Mac, project and unread chips picked are kept across visits, the search is not.
 */
export function AgentsScreen() {
  const agents = useAgents();
  const [query, setQuery] = useState('');
  const [project, keepProject] = useKept('agents.project');
  const [mac, keepMac] = useKept('agents.mac');
  const [unread, keepUnread] = useKept('agents.unread');
  const filter: RowFilter = { query, project, mac, unreadOnly: unread !== undefined };
  const setFilter = (next: RowFilter) => {
    setQuery(next.query);
    keepProject(next.project);
    keepMac(next.mac);
    keepUnread(next.unreadOnly ? 'on' : undefined);
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
