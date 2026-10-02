import type { HookEvent } from './hook-events.js';
import type { SessionRecord } from './record.js';

/**
 * Whether a session has a conversation a swap would lose, as Mesa cannot carry one across
 * agents: a goal, a prompt Mesa sent, or a prompt its agent's hook logged.
 * ponytail: a prompt typed with hooks off leaves no trace here; read the native transcript if
 * that ever swaps a conversation away.
 */
export const hasConversation = (record: SessionRecord, events: readonly HookEvent[]) =>
  Boolean(record.goal?.trim()) ||
  record.events.some((event) => event.type === 'send') ||
  events.some((event) => event.event === 'UserPromptSubmit');
