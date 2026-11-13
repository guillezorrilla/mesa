import type { ReactNode } from 'react';
import { AgentsContext } from './agentsContext';
import { useAgentsLive } from './useAgentsLive';

/** Keeps every paired Mac's sessions live for the Agents tab and its badge alike. */
export function AgentsProvider({ children }: { children: ReactNode }) {
  return <AgentsContext value={useAgentsLive()}>{children}</AgentsContext>;
}
