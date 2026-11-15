import type { ChatFollowLine, SessionChat } from '@mesa/core';
import { useEffect, useRef, useState } from 'react';
import { usePlatform } from '@/lib/MesaRoot';
import { useSessionEvents } from '@/lib/useSessionEvents';
import type { SentPrompt } from '../selected/useSessionPrompt';
import { CHAT_PAGE, type ChatRead, transcriptHolds } from './useChat';

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
 * per refresh: the stream says what changed. A follow that ended (its host stopped, a resume
 * coming) opens again on the session's next change.
 */
export function useFollowedChat(sessionId: string, sent?: SentPrompt): ChatRead {
  const { follow } = usePlatform();
  const [count, setCount] = useState(CHAT_PAGE);
  /** Bumped to open a new follow after one ended. */
  const [opening, setOpening] = useState(0);
  const ended = useRef(false);
  const [state, setState] = useState<{ count: number; chat?: SessionChat }>({ count });
  const [error, setError] = useState<string>();
  useSessionEvents(() => {
    if (ended.current) setOpening((n) => n + 1);
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: `opening` only asks for a new follow.
  useEffect(() => {
    let active = true;
    let id: string | undefined;
    const stops: (() => void)[] = [];
    ended.current = false;
    void (async () => {
      try {
        id = await follow.open(sessionId, count);
        stops.push(
          await follow.onLine(id, (line) =>
            setState((last) => ({
              count,
              chat:
                followed(last.count === count ? last.chat : undefined, JSON.parse(line)) ??
                last.chat,
            })),
          ),
          await follow.onExit(id, () => {
            ended.current = true;
          }),
        );
        if (!active) {
          for (const stop of stops) stop();
          return;
        }
        setError(undefined);
        await follow.ready(id);
      } catch (failed) {
        if (!active) return;
        setError(failed instanceof Error ? failed.message : String(failed));
        // The older look failed: the chat shown stays, not reading.
        setState((last) => ({ ...last, count }));
      }
    })();
    return () => {
      active = false;
      for (const stop of stops) stop();
      if (id) void follow.close(id);
    };
  }, [follow, sessionId, count, opening]);
  const { chat } = state;
  return {
    chat,
    error: error === undefined ? undefined : { code: 'internal', message: error },
    sending:
      sent?.id === sessionId && chat && !transcriptHolds(chat.messages, sent) ? sent : undefined,
    loadingOlder: state.count !== count,
    older: () => {
      if (chat?.more) setCount((shown) => shown + CHAT_PAGE);
    },
  };
}
