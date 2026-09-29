import { appendFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { codexWorld, plantTranscript, projectProfile, scriptedRunner } from '../testing/index.js';

test('bounded native search finds user and assistant text but omits provider instructions', () => {
  const codex = codexWorld();
  const { run } = scriptedRunner();
  const { mesa, home, dir } = projectProfile(run, { env: codex.env });
  const claudeId = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
  const codexId = '01a0e14e-be41-72f1-a81b-e25d2198602a';
  plantTranscript(
    home,
    claudeId,
    dir,
    [
      JSON.stringify({
        type: 'user',
        cwd: dir,
        message: { role: 'user', content: 'Find the harbor tide' },
      }),
      JSON.stringify({
        type: 'user',
        cwd: dir,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', content: 'harbor tide tool result' }],
        },
      }),
      // Claude Code injects a loaded skill's body as a meta user line.
      JSON.stringify({
        type: 'user',
        cwd: dir,
        isMeta: true,
        message: { role: 'user', content: [{ type: 'text', text: 'tide skill body' }] },
      }),
      JSON.stringify({
        type: 'assistant',
        cwd: dir,
        isSidechain: true,
        message: { role: 'assistant', content: 'secret tide' },
      }),
    ].join('\n'),
  );
  const rollout = codex.rollout({ id: codexId, cwd: dir, startedAt: '2026-09-20T11:58:00.000Z' });
  appendFileSync(
    rollout,
    `\n${JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'secret tide from startup instructions' }] } })}`,
  );
  appendFileSync(rollout, `\n${JSON.stringify({ type: 'turn_context' })}`);
  appendFileSync(
    rollout,
    `\n${JSON.stringify({ type: 'response_item', timestamp: '2026-09-20T12:00:00.000Z', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'The tide is low.' }] } })}`,
  );
  appendFileSync(
    rollout,
    `\n${JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'secret tide' }] } })}`,
  );

  const result = mesa.sessions.search('lantern-cove', 'tide');
  expect(result.hits.map((hit) => [hit.agent, hit.role, hit.id])).toEqual(
    expect.arrayContaining([
      ['codex', 'assistant', codexId],
      ['claude', 'user', claudeId],
    ]),
  );
  expect(result.hits.some((hit) => hit.excerpt.includes('harbor tide tool result'))).toBe(true);
  expect(result.hits.map((hit) => hit.excerpt)).not.toContain('secret tide');
  expect(result.hits.some((hit) => hit.excerpt.includes('skill body'))).toBe(false);
  expect(result.filesSearched).toBe(2);
  expect(result.truncated).toBe(false);
  expect(() => mesa.sessions.search('lantern-cove', 'x')).toThrow(
    'conversation search needs 2-200 characters',
  );
});

test('search reads at most the transcript tail and reports partial results', () => {
  const { run } = scriptedRunner();
  const { mesa, home, dir } = projectProfile(run);
  const id = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
  plantTranscript(
    home,
    id,
    dir,
    [
      JSON.stringify({
        type: 'user',
        cwd: dir,
        message: { role: 'user', content: 'first harbor' },
      }),
      JSON.stringify({
        type: 'user',
        cwd: dir,
        message: { role: 'user', content: 'x'.repeat((2 << 20) + 100) },
      }),
      JSON.stringify({
        type: 'assistant',
        cwd: dir,
        message: { role: 'assistant', content: [{ type: 'text', text: 'latest harbor' }] },
      }),
    ].join('\n'),
  );
  const result = mesa.sessions.search('lantern-cove', 'harbor');
  expect(result.hits.map((hit) => hit.excerpt)).toEqual(['latest harbor']);
  expect(result.truncated).toBe(true);
});
