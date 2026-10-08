import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { windowEnv } from '../sessions/window/caller.js';
import {
  ADVICE_MARKER,
  assistedAgent,
  CLEF_QUOTA_BODY,
  type systemOneWorld,
  testDeps,
} from '../testing/index.js';
import type { SystemOneProvider } from './systemone.js';

// ADR-0019's concurrency and safety gate over the hosted models' failures (#465): with 1, 4 and 8
// sessions asking at once, a rate limit, an overload, CLEF's used-up daily free allocation, a
// revoked key and no network each leave every turn to go on with no advice, the reason in the
// session's decision status, and no answer reaching another session.

const native = (i: number) => `7d1e5a52-0b8c-4c43-9b7e-2f6a1c3d9e${String(i).padStart(2, '0')}`;
const prompt = (session_id: string) =>
  JSON.stringify({
    session_id,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Make the feed import retry on 503',
  });

/**
 * `n` live Claude sessions on lantern-cove over one profile whose Decision model is `model`
 * (opted into experimental automatic advice, as no site is proven yet), each with its own native
 * conversation and its own `mesa` inside its window; the vault holds the marked retry note.
 */
async function sessions(n: number, model: SystemOneProvider) {
  const base = await assistedAgent('claude', native(0), { model });
  const rest = Array.from({ length: n - 1 }, (_, i) =>
    base.plant({
      agent: 'claude',
      agentSessionId: native(i + 1),
      vaultMounted: true,
      decisionsMounted: true,
      goal: base.session.goal,
    }),
  );
  const all = [base.session, ...rest].map((session, i) => ({
    session,
    native: native(i),
    mesa:
      i === 0
        ? base.mesa
        : createMesa(
            'default',
            testDeps(base.home, { ...base.world.deps, env: windowEnv(session.id, 'default') }),
          ),
  }));
  /** Every session's turn at once: each hook's output. */
  const turn = () => Promise.all(all.map((s) => s.mesa.hookEvent('claude', prompt(s.native))));
  return { ...base, all, turn };
}

type World = ReturnType<typeof systemOneWorld>;
const CASES: [string, SystemOneProvider, (world: World) => void, string][] = [
  ['a rate limit', 'jev', (w) => w.refuse('jev', 429), 'Jev rate limit reached (HTTP 429)'],
  ['an overload', 'jev', (w) => w.refuse('jev', 529), 'Jev is overloaded (HTTP 529)'],
  [
    "CLEF's used-up daily free allocation",
    'clef',
    (w) => w.refuse('clef', 429, CLEF_QUOTA_BODY),
    'CLEF daily free allocation is used up (HTTP 429): it resets at 00:00 UTC, or move to Workers Paid',
  ],
  ['a revoked key', 'jev', (w) => w.refuse('jev', 401), 'Jev rejected the key (HTTP 401)'],
  ['no network', 'jev', (w) => w.offline(), 'Jev could not be reached'],
];

for (const n of [1, 4, 8]) {
  test.each(CASES)(
    `with ${n} sessions at once, %s leaves every turn going with no advice and the reason shown`,
    async (_, model, fail, reason) => {
      const { world, all, turn } = await sessions(n, model);
      fail(world);
      const events = await turn();
      for (const [i, event] of events.entries()) {
        // The hook still answers: the turn goes on, as without Mesa.
        expect(event, `session ${i}`).toMatchObject({ event: 'UserPromptSubmit' });
        expect(event && 'advice' in event ? event.advice : undefined).toBeUndefined();
      }
      // Each session asked once for itself: no failure is shared or retried.
      expect(world.requests).toHaveLength(n);
      for (const { mesa } of all) {
        const [use] = mesa.decisions.status().use;
        expect(use).toMatchObject({ site: 'relevance', mode: 'automatic', status: 'unavailable' });
        expect(use?.reason).toContain(reason);
        expect(use?.cached).toBeUndefined();
      }
    },
  );
}

test.each([1, 4, 8])(
  'with %i sessions asking the same, no answer reaches another session: zero cross-session cache hits',
  async (n) => {
    const { world, all, turn } = await sessions(n, 'jev');
    // A failure is never kept as an answer: once the model is back, each session asks anew.
    world.refuse('jev', 429);
    await turn();
    world.refuse('jev');
    const events = await turn();
    expect(world.requests).toHaveLength(2 * n);
    for (const [i, event] of events.entries()) {
      const advice = event && 'advice' in event ? event.advice : undefined;
      expect(advice, `session ${i}`).toContain(ADVICE_MARKER);
    }
    for (const { mesa, session } of all) {
      const status = mesa.decisions.status();
      expect(status.session).toBe(session.id);
      // Its own call, never another session's ready answer, though the packet was the same.
      expect(status.use.filter((u) => u.cached)).toEqual([]);
      expect(status.ready).toBe(1);
    }
    // The same prompt again: each reads only its own ready answer, with no new call.
    await turn();
    expect(world.requests).toHaveLength(2 * n);
    for (const { mesa } of all) expect(mesa.decisions.status().use[0]?.cached).toBe(true);
  },
);
