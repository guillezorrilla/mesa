import { MesaError } from '../../lib/result.js';
import {
  type NativePrompt,
  type NativeResponse,
  type ResponseDeps,
  sessionResponses,
} from './responses.js';

/** One message of a session's chat: the agent's reply or the person's prompt, its text's revision as its id. */
export type ChatMessage = { id: string; at: string | null; text: string; from: 'agent' | 'you' };

/** A session's chat as `mesa chat` prints it: oldest first, how many, and whether older replies exist. */
export type SessionChat = {
  messages: ChatMessage[];
  count: number;
  more: boolean;
  /** Why the session's transcript cannot be read yet (sessionResponses), none when it can. */
  unavailable?: string;
};

/** How many replies a chat opens with. */
export const CHAT_COUNT = 20;

/**
 * The agent's newest `count` replies with, when `withPrompts`, the person's prompts placed among
 * them, newest first, and whether older replies exist. `read` is sessionResponses', which leaves
 * out tool results and injected text.
 */
export function chatMessages(
  read: { rows: Pick<NativeResponse, 'revision' | 'text' | 'at'>[]; prompts: NativePrompt[] },
  count: number,
  withPrompts = true,
): { messages: ChatMessage[]; more: boolean } {
  const message = (
    id: string,
    at: string | undefined,
    text: string,
    from: ChatMessage['from'],
  ) => ({
    id,
    at: at ?? null,
    text,
    from,
  });
  const promptsBefore = (newer: number) =>
    withPrompts
      ? read.prompts
          .filter((prompt) => prompt.newer === newer)
          .map((prompt) => message(prompt.revision, prompt.at, prompt.text, 'you'))
      : [];
  return {
    messages: [
      ...promptsBefore(0),
      ...read.rows
        .slice(0, count)
        .flatMap((row, index) => [
          message(row.revision, row.at, row.text, 'agent'),
          ...promptsBefore(index + 1),
        ]),
    ],
    more: read.rows.length > count,
  };
}

/**
 * Session `id`'s chat: its agent's newest `count` replies and the person's prompts among them,
 * oldest first, read from its native transcript (Claude Code or Codex).
 */
export function sessionChat(deps: ResponseDeps, id: string, count = CHAT_COUNT): SessionChat {
  if (!Number.isInteger(count) || count < 1)
    throw new MesaError('usage', 'count must be a whole number above 0');
  // One more than shown, to know whether older replies exist.
  const read = sessionResponses(deps, id, count + 1);
  const { messages, more } = chatMessages(read, count);
  return {
    messages: messages.reverse(),
    count: messages.length,
    more,
    ...(read.unavailable ? { unavailable: read.unavailable } : {}),
  };
}
