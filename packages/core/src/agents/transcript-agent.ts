import { AGENTS } from './agents.js';
import type { Agent } from './names.js';

// Which agents Mesa reads the native conversations of: those whose entry (AGENTS, agents.ts) has
// `transcripts` (transcripts.ts).

/** The agents Mesa reads native conversations of: those whose entry has `transcripts`. */
export type TranscriptAgent = {
  [A in Agent]: (typeof AGENTS)[A]['transcripts'] extends undefined ? never : A;
}[Agent];

/** Whether Mesa reads `agent`'s native conversations (its entry's `transcripts`). */
export const readsTranscripts = (agent: Agent): agent is TranscriptAgent =>
  AGENTS[agent].transcripts !== undefined;
