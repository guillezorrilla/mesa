import type { ChatFollowLine, PendingPrompt, SessionChat } from '@mesa/core';
import { useEffect, useRef, useState } from 'react';
import { followRoute } from '@/lib/followRoutes';
import { useFollowRoutes, usePlatform } from '@/lib/MesaRoot';
import { useSessionEvents } from '@/lib/useSessionEvents';
import type { SentPrompt } from '../selected/useSessionPrompt';
import { CHAT_PAGE, type ChatRead, transcriptHolds } from './useChat';

/**
 * `chat` after one line of `mesa chat --follow`: the whole chat, one item new (added) or changed
 * (replaced where it is, so a reply grows in place), or the agent's prompt suggestion.
 */
export function followed(
  chat: SessionChat | undefined,
  line: ChatFollowLine,
): SessionChat | undefined {
  if (line.type === 'chat') {
    const { type: _, ...whole } = line;
    return whole;
  }
  if (line.type === 'suggestion' && chat) {
    const { suggestion: _old, ...rest } = chat;
    return line.text ? { ...rest, suggestion: line.text } : rest;
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
 * while the chat is open, the prompt its agent waits on included (none once the follow ends),
 * read again further back on `older`, closed when it closes. No CLI call per refresh: the stream
 * says what changed; and while it runs, the session's chat actions run in it (followRoutes.ts).
 * A follow that ended (its host stopped, a resume coming) opens again on the session's next change.
 */
export function useFollowedChat(sessionId: string, sent?: SentPrompt): ChatRead {
  const { follow } = usePlatform();
  const routes = useFollowRoutes();
  const [count, setCount] = useState(CHAT_PAGE);
  /** Bumped to open a new follow after one ended. */
  const [opening, setOpening] = useState(0);
  const ended = useRef(false);
  const [state, setState] = useState<{ count: number; chat?: SessionChat }>({ count });
  /** The prompt the agent waits on, as this session's stream last said; none before it says. */
  const [asked, setAsked] = useState<{ session: string; prompt: PendingPrompt | null }>();
  const [error, setError] = useState<string>();
  useSessionEvents(() => {
    if (ended.current) setOpening((n) => n + 1);
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: `opening` only asks for a new follow.
  useEffect(() => {
    let active = true;
    let id: string | undefined;
    const stops: (() => void)[] = [];
    // The session's chat actions go over this follow while it runs (followRoutes.ts).
    const channel = followRoute((line) =>
      id ? follow.write(id, line) : Promise.reject(new Error('not open yet')),
    );
    const unroute = () => {
      if (routes.get(sessionId) === channel.route) routes.delete(sessionId);
      channel.end();
    };
    ended.current = false;
    void (async () => {
      try {
        id = await follow.open(sessionId, count);
        stops.push(
          await follow.onLine(id, (text) => {
            const line = JSON.parse(text) as ChatFollowLine;
            if (line.type === 'reply') return channel.answered(line.id, line.reply);
            if (line.type === 'end') unroute();
            // A follow that ended (its host gone) leaves nothing waiting on an answer.
            if (line.type === 'prompt' || line.type === 'end')
              return setAsked({
                session: sessionId,
                prompt: line.type === 'end' ? null : line.prompt,
              });
            setState((last) => ({
              count,
              chat: followed(last.count === count ? last.chat : undefined, line) ?? last.chat,
            }));
          }),
          await follow.onExit(id, () => {
            ended.current = true;
            unroute();
            setAsked({ session: sessionId, prompt: null });
          }),
        );
        if (!active) {
          for (const stop of stops) stop();
          return;
        }
        setError(undefined);
        await follow.ready(id);
        if (active) routes.set(sessionId, channel.route);
      } catch (failed) {
        if (!active) return;
        setError(failed instanceof Error ? failed.message : String(failed));
        // The older look failed: the chat shown stays, not reading.
        setState((last) => ({ ...last, count }));
      }
    })();
    return () => {
      active = false;
      unroute();
      for (const stop of stops) stop();
      if (id) void follow.close(id);
    };
  }, [follow, routes, sessionId, count, opening]);
  const { chat } = state;
  return {
    chat,
    error: error === undefined ? undefined : { code: 'internal', message: error },
    sending:
      sent?.id === sessionId && chat && !transcriptHolds(chat.messages, sent) ? sent : undefined,
    prompt: asked?.session === sessionId ? asked.prompt : null,
    loadingOlder: state.count !== count,
    older: () => {
      if (chat?.more) setCount((shown) => shown + CHAT_PAGE);
    },
  };
}
