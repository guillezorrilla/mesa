import { useOnFocus } from '@/lib/useOnFocus';
import { useAgentsContext } from './agentsContext';

/** The Agents tab's data (AgentsProvider), its open gates asked again on focus (back from one resolved). */
export function useAgents() {
  const agents = useAgentsContext();
  useOnFocus(agents.refreshGates);
  return agents;
}
