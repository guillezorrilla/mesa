import { relativeAgo } from '@mesa/core/phone';
import type { ChatItem } from './chatItems';

/** Who opens a group of messages and how long ago: "You · 5m ago"; a message on its way has no time. */
export const groupLabel = (from: ChatItem['from'], at: string | null, now: number) =>
  `${from === 'you' ? 'You' : 'Agent'}${at ? ` · ${relativeAgo(at, now)}` : ''}`;
