import { describe, expect, it } from 'vitest';
import { RECORDED_CLAUDE_STREAM, RECORDED_CODEX_STREAM } from '../../testing/index.js';
import { journalItems, journalSuggestion } from './live-chat.js';

const AT = '2026-11-15T10:00:00.000Z';
/** A host's journal: the prompt sent, then each line its agent printed. */
const journal = (stream: string[]) => [
  JSON.stringify({ at: AT, sent: { type: 'user', text: 'make a file' } }),
  ...stream.map((line) => {
    let event: unknown = line;
    try {
      event = JSON.parse(line);
    } catch {
      // Kept as the text it was, as the host journals it.
    }
    return JSON.stringify({ at: AT, event });
  }),
];

describe('journalItems', () => {
  it("folds a Codex session's journal as app-server events", () => {
    const items = journalItems(journal(RECORDED_CODEX_STREAM), '/proj', 'codex');
    expect(items.map((i) => i.from)).toEqual(['you', 'steps', 'agent']);
    expect(items.at(-1)).toMatchObject({ text: 'Done.' });
  });

  it("folds a Claude Code session's journal as stream-json events", () => {
    const items = journalItems(journal(RECORDED_CLAUDE_STREAM), '/proj', 'claude');
    expect(items.map((i) => i.from)).toEqual(['you', 'agent', 'steps']);
  });

  it("folds Mesa's model and effort change as the transcript has it: two commands, no reply", () => {
    const lines = [
      JSON.stringify({ at: AT, sent: { type: 'user', text: 'Reply with just READY.' } }),
      JSON.stringify({
        at: AT,
        event: { type: 'assistant', message: { content: [{ type: 'text', text: 'READY.' }] } },
      }),
      JSON.stringify({ at: AT, event: { type: 'result', subtype: 'success', num_turns: 1 } }),
      JSON.stringify({ at: AT, sent: { type: 'model', model: 'sonnet', effort: 'high' } }),
      JSON.stringify({
        at: AT,
        event: {
          type: 'assistant',
          message: {
            model: '<synthetic>',
            content: [{ type: 'text', text: 'Set effort level to high (this session only)' }],
          },
        },
      }),
    ];
    const items = journalItems(lines, '/proj', 'claude');
    expect(items.map((i) => [i.from, i.text])).toEqual([
      ['you', 'Reply with just READY.'],
      ['agent', 'READY.'],
      ['command', '/model sonnet'],
      ['command', '/effort high'],
    ]);
    expect(items.at(-1)).toMatchObject({ output: 'Set effort level to high (this session only)' });
  });
});

describe('journalSuggestion', () => {
  // As claude 2.1.325 prints one with --prompt-suggestions (spike section 7).
  const suggest = (text: string) =>
    JSON.stringify({ type: 'prompt_suggestion', suggestion: text, session_id: 's' });
  const sent = (text: string) => JSON.stringify({ at: AT, sent: { type: 'user', text } });

  it('is the newest suggestion since the last message sent, and none once another is sent', () => {
    const lines = journal([suggest('chart the tide'), suggest('chart the reef')]);
    expect(journalSuggestion(lines)).toBe('chart the reef');
    expect(journalSuggestion([...lines, sent('light the lantern')])).toBeUndefined();
    expect(journalSuggestion(journal(RECORDED_CLAUDE_STREAM))).toBeUndefined();
  });
});
