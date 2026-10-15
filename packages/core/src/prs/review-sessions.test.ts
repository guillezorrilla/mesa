import { expect, test } from 'vitest';
import type { SessionState } from '../sessions/record/states.js';
import { reviewing } from './review-sessions.js';

const session = (state: SessionState, alive = true) => ({ alive, lastState: { state } });

test('a review round is in progress while its agent works, asks, or waits its turn', () => {
  expect(reviewing(session('working'))).toBe(true);
  expect(reviewing(session('waiting-permission'))).toBe(true);
  expect(reviewing(session('queued', false))).toBe(true);
});

test('an idle agent is through with its round though its session stays open', () => {
  expect(reviewing(session('idle'))).toBe(false);
  expect(reviewing(session('done'))).toBe(false);
  // Its window gone mid-turn: the last state it reported is stale.
  expect(reviewing(session('working', false))).toBe(false);
});
