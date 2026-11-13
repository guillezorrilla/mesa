import { useSettled } from '@/lib/useSettled';
import { mergeListings, needsYouCount } from './agentRows';
import { useAgentsContext } from './agentsContext';

/** How many wait on the person over every paired Mac, live as the Agents tab, for its badge. */
export function useNeedsYouCount() {
  const agents = useAgentsContext();
  const listed = useSettled(agents.listing) ?? [];
  return needsYouCount(mergeListings(listed, agents.updates), agents.gates);
}
