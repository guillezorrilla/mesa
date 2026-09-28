import { appendFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { codexWorld } from '../../testing/index.js';
import { codexContext } from './context-use.js';

const ID = '01a0e693-6c67-71d0-8cd9-e0ace3513477';
const AT = '2026-09-28T05:53:40.932Z';

test('Codex context reads the last native per-turn input and window from its exact rollout', () => {
  const world = codexWorld();
  const deps = { home: world.home, env: world.env };
  expect(codexContext(deps, ID)).toBeUndefined();
  const file = world.rollout({ id: ID, cwd: '/src/lantern-cove', startedAt: AT });
  expect(codexContext(deps, ID)).toBeUndefined();
  appendFileSync(
    file,
    `\n${JSON.stringify({
      timestamp: AT,
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: { input_tokens: 90000 },
          last_token_usage: { input_tokens: 25942, cached_input_tokens: 12544 },
          model_context_window: 258400,
        },
      },
    })}\n`,
  );
  expect(codexContext(deps, ID)).toEqual({
    used: 10.04,
    window: 258400,
    at: AT,
    source: 'transcript',
  });
  appendFileSync(file, '\n{"type":"event_msg","payload":{"type":"token_count","info":{}}}\n');
  expect(codexContext(deps, ID)?.used).toBe(10.04);
  expect(codexContext(deps, '01a0e693-6c67-71d0-8cd9-e0ace3513478')).toBeUndefined();
});
