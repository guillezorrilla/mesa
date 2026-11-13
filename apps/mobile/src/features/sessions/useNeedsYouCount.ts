import { use } from 'react';
import { useSettled } from '@/lib/useSettled';
import { mergeListings, needsYouCount } from './agentRows';
import { AgentsContext } from './agentsContext';

/** How many wait on the person over every paired Mac, live as the Agents tab, for its badge. */
export function useNeedsYouCount() {
  const agents = use(AgentsContext);
  if (!agents) throw new Error('useNeedsYouCount outside AgentsProvider');
  const listed = useSettled(agents.listing) ?? [];
  return needsYouCount(mergeListings(listed, agents.updates), agents.gates);
}
