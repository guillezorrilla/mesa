import { createContext, use } from 'react';
import type { useAgentsLive } from './useAgentsLive';

/** The Agents tab's data, held above the tabs; undefined outside AgentsProvider. */
export const AgentsContext = createContext<ReturnType<typeof useAgentsLive> | undefined>(undefined);

/** The Agents tab's data as AgentsProvider holds it; only under it. */
export function useAgentsContext() {
  const agents = use(AgentsContext);
  if (!agents) throw new Error('Agents data read outside AgentsProvider');
  return agents;
}
