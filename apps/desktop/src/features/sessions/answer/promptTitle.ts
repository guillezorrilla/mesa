import type { PendingPrompt } from '@mesa/core';

type Pending = Extract<PendingPrompt, { status: 'pending' }>;

/** The card's heading: what the agent asks for. */
export const promptTitle = (prompt: Pick<Pending, 'kind' | 'tool'>) =>
  prompt.kind === 'question' ? 'The agent asks' : `Allow ${prompt.tool ?? 'this tool'}?`;
