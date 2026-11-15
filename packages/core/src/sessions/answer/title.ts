import type { PendingPrompt } from './pending.js';

type Pending = Extract<PendingPrompt, { status: 'pending' }>;

/** A prompt card's heading, on the desktop and the phone: what the agent asks for. */
export const promptTitle = (prompt: Pick<Pending, 'kind' | 'tool'>) =>
  prompt.kind === 'question' ? 'The agent asks' : `Allow ${prompt.tool ?? 'this tool'}?`;

/** The typed answer's hint: a question's own answer, or a permission's reason to deny it. */
export const typedAnswerHint = (prompt: Pick<Pending, 'kind'>) =>
  prompt.kind === 'permission' ? 'Or deny with a reason' : 'Or type an answer';
