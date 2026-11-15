import { parseStreamLine } from '../../agents/claude/stream/events.js';
import { parseAppServerLine } from '../../agents/codex/appserver/events.js';
import type { ChatItem, SessionChat } from '../native/chat.js';
import { foldCodexEvent } from '../native/codex-stream-chat.js';
import { mergeChat } from '../native/merge-chat.js';
import {
  foldStreamEvent,
  newStreamChat,
  type StreamChat,
  streamChatItems,
  streamChatSent,
} from '../native/stream-chat.js';
import type { SessionRecord } from '../record/record.js';
import { journalEntries, journalSize, readJournal } from './journal.js';
import { askHost, hostSocket } from './socket.js';

// A Structured session's chat (ADR-0029): its transcript's history with its journal folded in
// (stream-chat.ts), so a reply shows while it streams; and the same chat followed as it changes.

/** Folds one journalled event of `agent`'s runner (Claude's stream-json, Codex's app-server). */
const foldJournalled = (
  agent: SessionRecord['agent'],
  state: StreamChat,
  line: string,
  at: string,
) =>
  agent === 'codex'
    ? foldCodexEvent(state, parseAppServerLine(line), at)
    : foldStreamEvent(state, parseStreamLine(line), at);

/** A journal's lines (readJournal) of `agent`'s session folded into chat items, oldest first. */
export function journalItems(
  lines: readonly string[],
  cwd: string,
  agent: SessionRecord['agent'],
): ChatItem[] {
  let state: StreamChat = newStreamChat(cwd);
  for (const { at, sent, event } of journalEntries(lines)) {
    if (sent?.type === 'user' && typeof sent.text === 'string' && sent.text)
      state = streamChatSent(state, sent.text, at);
    else if (sent?.type === 'model' && agent === 'claude') {
      // As the transcript has them: `/model` (claude answers its control request, not the chat),
      // then `/effort`, whose synthetic reply is its output.
      if (typeof sent.model === 'string') {
        const { command: _answered, ...rest } = streamChatSent(state, `/model ${sent.model}`, at);
        state = rest;
      }
      if (typeof sent.effort === 'string')
        state = streamChatSent(state, `/effort ${sent.effort}`, at);
    } else if (event !== undefined) state = foldJournalled(agent, state, event, at);
  }
  return streamChatItems(state);
}

export type LiveChatDeps = {
  /** The transcript's chat (sessionChat), oldest first. */
  history: (id: string, count?: number) => SessionChat;
  record: (id: string) => SessionRecord;
  /** The folder a session's agent works in, which its steps name files against. */
  folder: (record: SessionRecord) => string;
  /** Whether its window still runs a process: a host that never came up ends a follow too. */
  windowAlive: (record: SessionRecord) => Promise<boolean>;
  journals: string;
  hosts: string;
  sleep: (ms: number) => Promise<void>;
};

/** A session's chat as `mesa chat` prints it: for a Structured one, with its journal merged in. */
export function liveChat(deps: LiveChatDeps, id: string, count?: number): SessionChat {
  const chat = deps.history(id, count);
  const record = deps.record(id);
  if (record.view !== 'structured') return chat;
  const lines = readJournal(deps.journals, id) ?? [];
  const messages = mergeChat(chat.messages, journalItems(lines, deps.folder(record), record.agent));
  return { ...chat, messages, count: messages.length };
}

/** How often a follow looks at the journal again. */
const FOLLOW_MS = 50;
/** How often a follow asks whether the host still runs. */
const PING_MS = 1000;

/** One line of `mesa chat --follow`: the chat at the start, then each item as it changes. */
export type ChatFollowLine =
  | ({ type: 'chat' } & SessionChat)
  | { type: 'item'; item: ChatItem }
  | { type: 'end' };

/**
 * `mesa chat --follow`: the chat now, then each item that is new or changed, until `open` says
 * the reader is gone or the session's host has ended (or never runs: a Terminal session prints its
 * chat once). shortcut: a grown journal is read and folded whole; keep an offset if journals grow large.
 */
export async function followChat(
  deps: LiveChatDeps,
  id: string,
  emit: (line: ChatFollowLine) => void,
  open: () => boolean,
  count?: number,
) {
  // The transcript is read once: within a follow the journal has every new item, and the
  // transcript's copy of one would come back under another id.
  const history = deps.history(id, count);
  const first = liveChat({ ...deps, history: () => history }, id, count);
  emit({ type: 'chat', ...first });
  const record = deps.record(id);
  if (record.view !== 'structured') return;
  const shown = new Map(first.messages.map((item) => [item.id, JSON.stringify(item)]));
  const socket = hostSocket(deps.hosts, id);
  let hosted = false;
  let size = -1;
  let pinged = 0;
  while (open()) {
    await deps.sleep(FOLLOW_MS);
    // The journal only grows: it is read again, and folded, only when it has.
    const now = journalSize(deps.journals, id);
    if (now !== size) {
      size = now;
      const lines = readJournal(deps.journals, id) ?? [];
      const items = mergeChat(
        history.messages,
        journalItems(lines, deps.folder(record), record.agent),
      );
      for (const item of items) {
        const text = JSON.stringify(item);
        if (shown.get(item.id) === text) continue;
        shown.set(item.id, text);
        emit({ type: 'item', item });
      }
    }
    pinged += FOLLOW_MS;
    if (pinged < PING_MS) continue;
    pinged = 0;
    if (await askHost(socket, { type: 'ping' })) hosted = true;
    else if (hosted || deps.record(id).endedAt || !(await deps.windowAlive(record))) break;
  }
  emit({ type: 'end' });
}
