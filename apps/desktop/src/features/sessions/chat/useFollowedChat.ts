import type { ChatFollowLine, SessionChat } from '@mesa/core';
import { useEffect, useState } from 'react';
import { usePlatform } from '@/lib/MesaRoot';
import type { SentPrompt } from '../selected/useSessionPrompt';
import { CHAT_PAGE, transcriptHolds } from './useChat';

/**
 * `chat` after one line of `mesa chat --follow`: the whole chat, or one item new (added) or
 * changed (replaced where it is, so a reply grows in place).
 */
export function followed(chat: SessionChat | undefined, line: ChatFollowLine) {
  if (line.type === 'chat') {
    const { type: _, ...whole } = line;
    return whole;
  }
  if (line.type !== 'item' || !chat) return chat;
  const at = chat.messages.findIndex((item) => item.id === line.item.id);
  const messages =
    at < 0
      ? [...chat.messages, line.item]
      : chat.messages.map((item, i) => (i === at ? line.item : item));
  return { ...chat, messages, count: messages.length };
}

/**
 * A Structured session's chat on its host's live stream (ADR-0029): one follow (Rust `follow_*`)
 * while the chat is open, read again further back on `older`, closed when it closes. No CLI call
 * per refresh: the stream says what changed.
 */
export function useFollowedChat(sessionId: string, sent?: SentPrompt) {
  const { follow } = usePlatform();
  const [count, setCount] = useState(CHAT_PAGE);
  const [state, setState] = useState<{ count: number; chat?: SessionChat }>({ count });
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    let id: string | undefined;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        id = await follow.open(sessionId, count);
        const stop = await follow.onLine(id, (line) =>
          setState((last) => ({
            count,
            chat:
              followed(last.count === count ? last.chat : undefined, JSON.parse(line)) ?? last.chat,
          })),
        );
        if (!active) return stop();
        unlisten = stop;
        await follow.ready(id);
      } catch (failed) {
        if (active) setError(failed instanceof Error ? failed.message : String(failed));
      }
    })();
    return () => {
      active = false;
      unlisten?.();
      if (id) void follow.close(id);
    };
  }, [follow, sessionId, count]);
  const { chat } = state;
  return {
    chat,
    error: error === undefined ? undefined : { code: 'internal' as const, message: error },
    sending:
      sent?.id === sessionId && chat && !transcriptHolds(chat.messages, sent) ? sent : undefined,
    /** Whether a look further back is still reading: the follow reopened, its chat not in yet. */
    loadingOlder: state.count !== count,
    older: () => {
      if (chat?.more) setCount((shown) => shown + CHAT_PAGE);
    },
  };
}
