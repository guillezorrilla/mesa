import type { PendingPrompt } from './pending.js';

type Pending = Extract<PendingPrompt, { status: 'pending' }>;

/** A prompt card's heading, on the desktop and the phone: what the agent asks for. */
export const promptTitle = (prompt: Pick<Pending, 'kind' | 'tool'>) =>
  prompt.kind === 'question' ? 'The agent asks' : `Allow ${prompt.tool ?? 'this tool'}?`;
