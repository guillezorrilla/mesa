import { claudeBlockEvents, type ContentBlock as RawBlock } from '../../agents/claude/steps.js';
import type { ContentBlock, StreamEvent } from '../../agents/claude/stream/events.js';
import { finishSteps, type TranscriptStep } from '../../agents/steps.js';
import { type ChatItem, type ChatMessage, chatRun } from './chat.js';

// A Structured session's live chat: the runner's stream events (agents/claude/stream) folded into
// the same chat items the transcript gives (chat.ts). Pure: each step returns a new state, so a
// host, a journal replay and a test all fold the same way.

export type StreamChat = {
  /** Finished items, oldest first. */
  items: ChatItem[];
  /** Steps of the run in progress, in time order. */
  run: TranscriptStep[];
  /** The agent's reply as streamed so far, before its `assistant` event makes it final. */
  live: string;
  /** Where in `items` a slash command waits for its output, none when none does. */
  command?: number;
  seq: number;
  /** The session's folder, which edits and reads name their files against. */
  cwd: string;
};

export const newStreamChat = (cwd: string): StreamChat => ({
  items: [],
  run: [],
  live: '',
  seq: 0,
  cwd,
});

/** Chat items from the transcript's steps get their ids from the tool call, so ours match them. */
const raw = (block: ContentBlock): RawBlock | undefined =>
  block.type === 'tool_use'
    ? { type: 'tool_use', id: block.id, name: block.name, input: block.input }
    : block.type === 'thinking'
      ? { type: 'thinking', thinking: block.text }
      : block.type === 'tool_result'
        ? {
            type: 'tool_result',
            tool_use_id: block.toolUseId,
            is_error: block.isError,
            content: block.content,
          }
        : undefined;

/** The open run closed into an item. */
function closeRun(state: StreamChat, at: string): StreamChat {
  const run = chatRun(state.run, at);
  return run ? { ...state, items: [...state.items, run], run: [] } : state;
}

const add = (state: StreamChat, item: Omit<ChatMessage, 'id'>): StreamChat => ({
  ...state,
  items: [...state.items, { ...item, id: `stream:${state.seq}` }],
  seq: state.seq + 1,
});

/**
 * What the person sent: a prompt, or a slash command (its output follows). Call it when the
 * message is written to the runner, so it sits before the reply.
 */
export function streamChatSent(state: StreamChat, text: string, at: string): StreamChat {
  const closed = closeRun(state, at);
  const command = text.startsWith('/');
  const next = add(closed, { at, text, from: command ? 'command' : 'you' });
  return command ? { ...next, command: next.items.length - 1 } : next;
}

/** A command item with `change` applied. */
const withCommand = (state: StreamChat, change: Partial<ChatMessage>): StreamChat => {
  const { command } = state;
  const item = command === undefined ? undefined : state.items[command];
  if (command === undefined || item?.from !== 'command') return state;
  const items = [...state.items];
  items[command] = { ...item, ...change };
  return { ...state, items };
};

/** The turn is over, by its `result` or the process ending: nothing is live or running any more. */
export function endStreamChatTurn(
  state: StreamChat,
  at: string,
  result?: { text: string; isError: boolean; turns: number | undefined },
): StreamChat {
  // An interrupted call never gets its result.
  let next = closeRun(
    {
      ...state,
      run: state.run.map((step) =>
        step.type !== 'thought' && step.status === 'running'
          ? { ...step, status: 'failed' as const }
          : step,
      ),
    },
    at,
  );
  if (next.live.trim()) next = add(next, { at, text: next.live, from: 'agent' });
  next = { ...next, live: '' };
  const item = next.command === undefined ? undefined : next.items[next.command];
  if (item?.from === 'command' && result) {
    // Claude Code answers its own commands with no model turn; the output came as a synthetic message.
    if (item.output === undefined && result.turns === 0 && result.text)
      next = withCommand(next, { output: result.text });
    if (result.isError) next = withCommand(next, { error: true });
  }
  const { command: _done, ...rest } = next;
  return rest;
}

/** `state` after one stream event, at time `at` (ISO). */
export function foldStreamEvent(state: StreamChat, event: StreamEvent, at: string): StreamChat {
  // A subagent's work is its own, as in the transcript (agents/claude/steps.ts).
  if ('sidechain' in event && event.sidechain) return state;
  switch (event.type) {
    case 'delta':
      return event.kind === 'text' ? { ...state, live: state.live + event.text } : state;
    case 'assistant': {
      let next = state;
      event.content.forEach((block, index) => {
        if (block.type === 'text') {
          next = closeRun({ ...next, live: '' }, at);
          next =
            event.synthetic && next.command !== undefined
              ? withCommand(next, { output: block.text })
              : add(next, { at, text: block.text, from: 'agent' });
          return;
        }
        const blockRaw = raw(block);
        const events = blockRaw
          ? claudeBlockEvents('assistant', [blockRaw], next.cwd, `stream:${next.seq}:${index}`)
          : [];
        for (const started of events)
          if ('start' in started) next = { ...next, run: [...next.run, started.start] };
      });
      // Two assistant events in a turn each name their thoughts from block 0.
      return { ...next, seq: next.seq + 1 };
    }
    case 'user': {
      const run = state.run.map((step) => ({ ...step }));
      const blocks = event.content.flatMap((block) => raw(block) ?? []);
      for (const finished of claudeBlockEvents('user', blocks, state.cwd, ''))
        if ('result' in finished) finishSteps(run, finished.result);
      return { ...state, run };
    }
    case 'result':
      return endStreamChatTurn(state, at, {
        text: event.result,
        isError: event.isError,
        turns: event.turns,
      });
    default:
      return state;
  }
}

/** Everything the chat shows now: finished items, the run in progress, and the reply streaming. */
export function streamChatItems(state: StreamChat, at: string | null = null): ChatItem[] {
  const run = chatRun(state.run, at);
  return [
    ...state.items,
    ...(run ? [run] : []),
    ...(state.live
      ? [{ id: `stream:${state.seq}`, at, text: state.live, from: 'agent' as const }]
      : []),
  ];
}
