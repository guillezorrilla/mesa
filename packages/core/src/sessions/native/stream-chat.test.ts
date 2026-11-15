import { describe, expect, it } from 'vitest';
import { parseStreamLine } from '../../agents/claude/stream/events.js';
import {
  INTERRUPTED_CLAUDE_STREAM,
  RECORDED_CLAUDE_STREAM,
  RECORDED_COMMAND_STREAM,
} from '../../testing/index.js';
import type { ChatItem } from './chat.js';
import { mergeChat } from './merge-chat.js';
import { foldStreamEvent, newStreamChat, streamChatItems, streamChatSent } from './stream-chat.js';

const AT = '2026-11-14T10:00:00.000Z';

/** The chat after `stream`'s first `count` lines (all when omitted), the prompt sent first. */
function fold(stream: string[], sent = 'make a file', count = stream.length) {
  let state = streamChatSent(newStreamChat('/proj'), sent, AT);
  for (const line of stream.slice(0, count))
    state = foldStreamEvent(state, parseStreamLine(line), AT);
  return state;
}

describe('foldStreamEvent', () => {
  it('grows a live agent message from deltas', () => {
    const state = fold(RECORDED_CLAUDE_STREAM, 'make a file', 3);
    expect(streamChatItems(state).map((i) => [i.from, (i as { text: string }).text])).toEqual([
      ['you', 'make a file'],
      ['agent', 'Sure, '],
    ]);
  });

  it('makes the reply final at its assistant event, then a run, and closes the turn at result', () => {
    const state = fold(RECORDED_CLAUDE_STREAM);
    const items = streamChatItems(state);
    expect(items.map((i) => i.from)).toEqual(['you', 'agent', 'steps']);
    expect(items[1]).toMatchObject({ text: 'Sure, writing it.' });
    expect(items[2]).toMatchObject({
      id: 'steps:toolu_1',
      text: 'Edited 1 file',
      steps: [{ id: 'toolu_1', line: 'Edited made.txt +1 -0', status: 'done' }],
      edits: [{ path: 'made.txt', added: 1, removed: 0 }],
    });
    expect(state.live).toBe('');
    expect(state.run).toEqual([]);
  });

  it('shows a tool call as running until its result', () => {
    const state = fold(RECORDED_CLAUDE_STREAM, 'x', 7);
    expect(streamChatItems(state).at(-1)).toMatchObject({
      from: 'steps',
      steps: [{ status: 'running' }],
    });
  });

  it('turns a slash command and its synthetic reply into one command row with its text', () => {
    const state = fold(RECORDED_COMMAND_STREAM, '/model');
    expect(streamChatItems(state)).toEqual([
      { id: 'stream:0', at: AT, text: '/model', from: 'command', output: 'Model: haiku' },
    ]);
  });

  it('keeps a skill expansion reply as an agent message, not command output', () => {
    let state = streamChatSent(newStreamChat('/p'), '/lantern', AT);
    for (const e of [
      { type: 'assistant', content: [{ type: 'text', text: 'LANTERN_OK' }], synthetic: false },
      {
        type: 'result',
        sessionId: 's',
        subtype: 'success',
        isError: false,
        result: 'LANTERN_OK',
        costUsd: 1,
        durationMs: 1,
        turns: 1,
        usage: undefined,
      },
    ] as const)
      state = foldStreamEvent(state, e, AT);
    expect(streamChatItems(state).map((i) => [i.from, (i as { output?: string }).output])).toEqual([
      ['command', undefined],
      ['agent', undefined],
    ]);
  });

  it('keeps the partial reply and fails the unfinished call when a turn is interrupted mid-delta', () => {
    const items = streamChatItems(fold(INTERRUPTED_CLAUDE_STREAM, 'tell a story'));
    expect(items.map((i) => i.from)).toEqual(['you', 'steps', 'agent']);
    expect(items[1]).toMatchObject({ steps: [{ id: 'toolu_9', status: 'failed' }] });
    expect(items[2]).toMatchObject({ text: 'The lighthouse keeper climbed' });
  });
});

describe('subagents', () => {
  it('leaves a subagent stream out of the main chat', () => {
    const state = foldStreamEvent(
      newStreamChat('/p'),
      { type: 'delta', kind: 'text', text: 'inner', index: 0, sidechain: true },
      AT,
    );
    expect(streamChatItems(state)).toEqual([]);
  });
});

describe('mergeChat', () => {
  const msg = (from: 'you' | 'agent', text: string, id = text): ChatItem => ({
    id,
    at: null,
    text,
    from,
  });
  const run = (id: string): ChatItem => ({
    id: `steps:${id}`,
    at: null,
    text: 'Ran',
    from: 'steps',
    steps: [],
  });

  it('keeps live items the transcript has not reached', () => {
    const history = [msg('you', 'a', 'h1'), msg('agent', 'b', 'h2')];
    expect(mergeChat(history, [msg('you', 'c', 's1')]).map((i) => i.text)).toEqual(['a', 'b', 'c']);
  });

  it('shows items once when the transcript has caught up, as the transcript has them', () => {
    const history = [msg('you', 'a', 'h1'), msg('agent', 'b', 'h2'), run('t1')];
    const live = [msg('agent', 'b', 's1'), run('t1'), msg('agent', 'streaming', 's2')];
    expect(mergeChat(history, live).map((i) => i.id)).toEqual(['h1', 'h2', 'steps:t1', 's2']);
  });

  it('adds nothing when the transcript is already past the stream, as after a resume', () => {
    const history = [msg('you', 'a', 'h1'), msg('agent', 'b', 'h2'), msg('agent', 'c', 'h3')];
    const live = [msg('you', 'a', 's1'), msg('agent', 'b', 's2')];
    expect(mergeChat(history, live).map((i) => i.id)).toEqual(['h1', 'h2', 'h3']);
  });

  it('matches a run that began with a thought by a step it shares', () => {
    const steps = (id: string) => ({ id, line: id, status: 'done' });
    const a = { ...run('x'), id: 'steps:stream:0:0', steps: [steps('stream:0:0'), steps('t1')] };
    const b = { ...run('x'), id: 'steps:uuid:0', steps: [steps('uuid:0'), steps('t1')] };
    expect(mergeChat([b], [a])).toEqual([b]);
  });

  it('is the live items alone with no history, and the history alone with no live items', () => {
    expect(mergeChat([], [msg('you', 'a', 's1')])).toHaveLength(1);
    expect(mergeChat([msg('you', 'a', 'h1')], [])).toHaveLength(1);
  });
});
