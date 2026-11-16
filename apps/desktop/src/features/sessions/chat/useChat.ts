import type { ChatItem, PendingPrompt, SessionChat } from '@mesa/core';
import { useEffect, useRef, useState } from 'react';
import { type CommandError, useCommand } from '@/lib/useCommand';
import { useSessionEvents } from '@/lib/useSessionEvents';
import type { SentPrompt } from '../selected/useSessionPrompt';

/** How many more replies each look further back reads. */
export const CHAT_PAGE = 20;
/** How often a chat looks again while a sent prompt is not in its transcript yet, and how long. */
const SENDING_POLL_MS = 2_000;
const SENDING_POLL_FOR_MS = 120_000;
/** How far a transcript's clock may run behind the app's when a prompt is sent. */
const SKEW_MS = 5_000;

/**
 * Whether `messages` hold prompt `sent`: one of the person's with its text, or the command row of
 * a slash command, written since.
 */
export const transcriptHolds = (messages: readonly ChatItem[], sent: SentPrompt) =>
  messages.some(
    (message) =>
      (message.from === 'command'
        ? message.text === sent.prompt.trim()
        : message.from === 'you' && message.text.includes(sent.prompt.trim())) &&
      (message.at === null || Date.parse(message.at) >= sent.at - SKEW_MS),
  );

/**
 * Session `sessionId`'s chat from its transcript, read again as its hooks write and on the
 * fallback poll, and further back on `older`; the prompt `sent` to it while its transcript does
 * not hold it yet. A Structured session's comes from its live stream instead (useFollowedChat).
 */
/** What a chat view reads, from the transcript (useChat) or the live stream (useFollowedChat). */
export type ChatRead = {
  chat: SessionChat | undefined;
  error: CommandError | undefined;
  sending: SentPrompt | undefined;
  /** Whether a look further back is still reading. */
  loadingOlder: boolean;
  older: () => void;
  /** The prompt the agent waits on, null for none, when the chat's own stream says (a follow's). */
  prompt?: PendingPrompt | null;
};

export function useChat(sessionId: string, sent?: SentPrompt): ChatRead {
  const [count, setCount] = useState(CHAT_PAGE);
  const read = useCommand('sessions.chat', { id: sessionId, count });
  // A look further back reads anew: keep the shorter chat in view until it answers.
  const last = useRef<SessionChat>(undefined);
  if (read.data) last.current = read.data;
  const chat = read.data ?? last.current;
  useSessionEvents(() => void read.refresh());
  const sending =
    sent?.id === sessionId && chat && !transcriptHolds(chat.messages, sent) ? sent : undefined;
  const refresh = useRef(read.refresh);
  refresh.current = read.refresh;
  useEffect(() => {
    if (!sending) return;
    const timer = window.setInterval(() => void refresh.current(), SENDING_POLL_MS);
    const stop = window.setTimeout(() => window.clearInterval(timer), SENDING_POLL_FOR_MS);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [sending]);
  return {
    chat,
    error: read.error,
    sending,
    /** Whether a look further back is still reading. */
    loadingOlder: !read.data && Boolean(last.current),
    older: () => {
      if (chat?.more) setCount((shown) => shown + CHAT_PAGE);
    },
  };
}
