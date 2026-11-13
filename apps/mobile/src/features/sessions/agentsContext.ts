import { createContext } from 'react';
import type { useAgentsLive } from './useAgentsLive';

/** The Agents tab's data, held above the tabs; undefined outside AgentsProvider. */
export const AgentsContext = createContext<ReturnType<typeof useAgentsLive> | undefined>(undefined);
