import { use } from 'react';
import { useOnFocus } from '@/lib/useOnFocus';
import { AgentsContext } from './agentsContext';

/** The Agents tab's data (AgentsProvider), its open gates asked again on focus (back from one resolved). */
export function useAgents() {
  const agents = use(AgentsContext);
  if (!agents) throw new Error('useAgents outside AgentsProvider');
  useOnFocus(agents.refreshGates);
  return agents;
}
