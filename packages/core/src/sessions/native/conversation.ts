import type { SessionRecord } from '../record/record.js';
import type { HookEvent } from '../signals/hook-events.js';

/**
 * Whether a session has a conversation a swap would lose, as Mesa cannot carry one across
 * agents: a goal, a prompt Mesa sent, or a prompt its agent's hook logged.
 * ponytail: a prompt typed with hooks off leaves no trace here; read the native transcript if
 * that ever swaps a conversation away.
 */
/** When a person spoke to the session, oldest first: each prompt Mesa sent, each one its hook logged. */
export const promptTimes = (record: SessionRecord, events: readonly HookEvent[]) =>
  [
    ...record.events.flatMap((event) => (event.type === 'send' ? [event.at] : [])),
    ...events.flatMap((event) => (event.event === 'UserPromptSubmit' ? [event.at] : [])),
  ].sort();

export const hasConversation = (record: SessionRecord, events: readonly HookEvent[]) =>
  Boolean(record.goal?.trim()) ||
  record.events.some((event) => event.type === 'send') ||
  events.some((event) => event.event === 'UserPromptSubmit');
