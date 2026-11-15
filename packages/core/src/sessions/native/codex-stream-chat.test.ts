import { describe, expect, it } from 'vitest';
import { parseAppServerLine } from '../../agents/codex/appserver/events.js';
import { INTERRUPTED_CODEX_STREAM, RECORDED_CODEX_STREAM } from '../../testing/index.js';
import { foldCodexEvent } from './codex-stream-chat.js';
import { newStreamChat, streamChatItems, streamChatSent } from './stream-chat.js';

const AT = '2026-11-15T10:00:00.000Z';

/** The chat after `stream`'s first `count` lines (all when omitted), `sent` sent first. */
function fold(stream: string[], sent = 'make a file', count = stream.length) {
  let state = streamChatSent(newStreamChat('/proj'), sent, AT);
  for (const line of stream.slice(0, count))
    state = foldCodexEvent(state, parseAppServerLine(line), AT);
  return state;
}

describe('foldCodexEvent', () => {
  it('grows a live agent message from text deltas', () => {
    const state = fold(RECORDED_CODEX_STREAM, 'make a file', 20);
    expect(streamChatItems(state).at(-1)).toMatchObject({ from: 'agent', text: 'Done' });
  });

  it('folds a turn into the prompt, one run of steps and the final reply', () => {
    const state = fold(RECORDED_CODEX_STREAM);
    const items = streamChatItems(state);
    expect(items.map((i) => i.from)).toEqual(['you', 'steps', 'agent']);
    expect(items[1]).toMatchObject({
      id: 'steps:r-1',
      steps: [
        { id: 'r-1', line: 'Plan the file', status: 'done' },
        { id: 'm-1', line: 'Writing it.', status: 'done' },
        { id: 'c-1', line: 'shell echo tide > made.txt', status: 'done' },
        { id: 'f-1', line: 'Edited notes.md +1 -1', status: 'done' },
      ],
      edits: [{ path: 'notes.md', added: 1, removed: 1 }],
    });
    expect(items[2]).toMatchObject({ text: 'Done.' });
    expect(state.live).toBe('');
    expect(state.run).toEqual([]);
  });

  it('shows a command as running until it completes', () => {
    const state = fold(RECORDED_CODEX_STREAM, 'x', 13);
    expect(streamChatItems(state).at(-1)).toMatchObject({
      from: 'steps',
      steps: [{ id: 'r-1' }, { id: 'm-1' }, { id: 'c-1', status: 'running' }],
    });
  });

  it('fails a command that exited non-zero and keeps its output', () => {
    let state = newStreamChat('/proj');
    for (const method of ['item/started', 'item/completed'] as const)
      state = foldCodexEvent(
        state,
        {
          type: method === 'item/started' ? 'item_started' : 'item_completed',
          item: {
            kind: 'commandExecution',
            id: 'c-2',
            command: 'false',
            status: method === 'item/started' ? 'inProgress' : 'failed',
            output: 'boom',
            exitCode: method === 'item/started' ? undefined : 1,
          },
        },
        AT,
      );
    expect(state.run).toEqual([
      {
        type: 'tool',
        id: 'c-2',
        kind: 'command',
        name: 'shell',
        target: 'false',
        status: 'failed',
        output: 'boom',
      },
    ]);
  });

  it('ends an interrupted turn: the running command failed, the half reply kept', () => {
    const state = fold(INTERRUPTED_CODEX_STREAM, 'tell a story');
    expect(streamChatItems(state)).toMatchObject([
      { from: 'you', text: 'tell a story' },
      { from: 'steps', steps: [{ id: 'c-9', status: 'failed' }] },
      { from: 'agent', text: 'The lighthouse ' },
    ]);
  });

  it('turns /compact into a command row with what it did', () => {
    let state = streamChatSent(newStreamChat('/proj'), '/compact', AT);
    state = foldCodexEvent(
      state,
      { type: 'item_completed', item: { kind: 'contextCompaction', id: 'k-1' } },
      AT,
    );
    state = foldCodexEvent(
      state,
      { type: 'turn_completed', turnId: 't', status: 'completed', error: undefined },
      AT,
    );
    expect(streamChatItems(state)).toEqual([
      { id: 'stream:0', at: AT, text: '/compact', from: 'command', output: 'Context compacted' },
    ]);
  });

  it("says a failed turn's error", () => {
    const state = foldCodexEvent(
      newStreamChat('/proj'),
      { type: 'turn_completed', turnId: 't', status: 'failed', error: 'usage limit reached' },
      AT,
    );
    expect(streamChatItems(state)).toMatchObject([{ from: 'agent', text: 'usage limit reached' }]);
  });
});
