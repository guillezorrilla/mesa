import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  assistedSession,
  fixedClock,
  folderSnapshot,
  profilePaths,
  systemOneWorld,
} from '../testing/index.js';
import { decide } from './decide.js';
import { type EvaluateDeps, evaluate } from './evaluate.js';
import { evidencePacket, nextStepPacket } from './packet.js';
import { rulesBackend } from './rules.js';
import { SYSTEM_ONE_MODELS, systemOneBackend } from './systemone.js';

const STEPS = {
  site: 'next-step',
  events: ['vitest: tide-table.test.ts expected 3 retries, got 0'],
  candidates: [
    { id: 'add-retry', step: 'Wrap the feed call in the retry helper and rerun the test' },
    { id: 'rerun', step: 'Rerun the suite to see whether it is flaky' },
  ],
};

/** Faro over Jev in the world, as the profile's Faro asks it, for the evaluate function alone. */
function jevDeps(world: ReturnType<typeof systemOneWorld>, passed: EvaluateDeps['passed']) {
  const clock = fixedClock();
  return {
    model: 'jev',
    passed,
    clock,
    ask: (state, questions, deadlineMs, { signal }) =>
      decide(
        {
          backends: [
            rulesBackend<unknown>([]),
            systemOneBackend({
              provider: 'jev',
              http: world.http,
              key: 'ts-test-0000-1111-abcd',
              model: SYSTEM_ONE_MODELS.jev,
              deadlineMs,
            }),
          ],
          profile: { decisions: { model: 'jev', threshold: Number.POSITIVE_INFINITY } },
          clock,
          ...(signal ? { signal } : {}),
        },
        state,
        questions,
      ),
  } satisfies EvaluateDeps;
}

const packet = nextStepPacket({
  goal: 'Make the tide table import retry on 503',
  events: [],
  attempts: [],
  candidates: STEPS.candidates,
});

test('an answer at or above the model threshold is accepted, below it abstained, and a failed call unavailable', async () => {
  const { world, mesa } = await assistedSession();
  // Jev's next-step threshold is 0.5: 3 options at 0.8 lean by 0.7.
  const accepted = await mesa.decisions.evaluate(STEPS);
  expect(accepted.evaluation).toMatchObject({
    site: 'next-step',
    mode: 'on-demand',
    status: 'accepted',
    answer: 'add-retry',
    margin: expect.closeTo(0.7, 6),
    acceptAt: 0.5,
    model: 'jev-1.13.0',
  });
  world.lean({ option: 'rerun', p: 0.5 });
  const abstained = await mesa.decisions.evaluate({ ...STEPS, attempts: ['Ran the test once'] });
  expect(abstained.evaluation).toMatchObject({ status: 'abstained', answer: 'rerun' });
  expect(abstained.evaluation.margin).toBeCloseTo(0.25, 6);
  // A hosted failure is unavailable, never an error: the agent works on without advice.
  world.refuse('jev', 503);
  const failed = await mesa.decisions.evaluate({ ...STEPS, events: ['another turn'] });
  expect(failed.evaluation).toMatchObject({
    status: 'unavailable',
    reason: 'Jev is unavailable (HTTP 503)',
  });
  expect(failed).toMatchObject({ advice: 'No advice: Jev is unavailable (HTTP 503).' });
  expect(world.requests).toHaveLength(3);
});

test('with no Decision model nothing is asked and nothing is written', async () => {
  const { world, mesa, home, vault } = await assistedSession({ model: 'none' });
  const before = folderSnapshot(vault);
  const out = await mesa.decisions.evaluate(STEPS);
  expect(out.evaluation).toEqual({
    site: 'next-step',
    mode: 'on-demand',
    status: 'unavailable',
    reason: 'no decision model: add a key with mesa decisions key set',
    latencyMs: 0,
  });
  expect(world.requests).toEqual([]);
  expect(folderSnapshot(vault)).toEqual(before);
  expect(existsSync(profilePaths(home, 'default').decisions)).toBe(false);
});

test('an automatic call runs only at a site the model qualified for; on demand the rest are experimental', async () => {
  const world = systemOneWorld();
  const deps = jevDeps(world, ['relevance']);
  const automatic = await evaluate(deps, packet, { mode: 'automatic' });
  expect(automatic).toMatchObject({
    status: 'unavailable',
    reason: 'jev did not qualify for automatic next-step advice',
  });
  expect(world.requests).toEqual([]);
  const asked = await evaluate(deps, packet, { mode: 'on-demand' });
  expect(asked).toMatchObject({ status: 'accepted', experimental: true });
  const qualified = await evaluate(jevDeps(world, ['next-step']), packet, { mode: 'automatic' });
  expect(qualified.status).toBe('accepted');
  expect(qualified.experimental).toBeUndefined();
});

test('an automatic call ends at the 1,500 ms per-turn deadline, and a cancelled call at once, its request too', async () => {
  const world = systemOneWorld();
  world.stall('jev');
  const signals: (AbortSignal | undefined)[] = [];
  const http: typeof world.http = (url, init) => {
    signals.push(init?.signal ?? undefined);
    return world.http(url, init);
  };
  const deps = jevDeps({ ...world, http }, ['next-step', 'evidence']);
  const started = Date.now();
  const late = await evaluate(deps, packet, { mode: 'automatic' });
  expect(late).toMatchObject({
    status: 'unavailable',
    reason: 'Jev did not answer within 1500 ms',
  });
  expect(Date.now() - started).toBeGreaterThanOrEqual(1400);

  const cancel = new AbortController();
  const asked = evaluate(deps, evidencePacket('The import retries', 'retry.test.ts passes'), {
    mode: 'on-demand',
    signal: cancel.signal,
  });
  const before = Date.now();
  cancel.abort();
  expect(await asked).toMatchObject({ status: 'unavailable', reason: 'cancelled' });
  expect(Date.now() - before).toBeLessThan(500);
  // The cancel reached the request itself, not only the wait for it, before its 10 s deadline.
  expect(signals).toHaveLength(2);
  expect(signals[1]?.reason).toMatchObject({ name: 'AbortError' });
});

test('the same packet is answered once per session, and another session never reuses it', async () => {
  const { world, mesa, person, home, plant } = await assistedSession();
  const first = await mesa.decisions.evaluate(STEPS);
  const again = await mesa.decisions.evaluate(STEPS);
  expect(world.requests).toHaveLength(1);
  expect(again.evaluation).toEqual({ ...first.evaluation, latencyMs: 0, cached: true });
  // Another live session with the same goal and candidates asks for itself.
  const other = plant({ goal: 'Make the tide table import retry when the feed answers 503' });
  await person.decisions.evaluate(STEPS, { session: other.id });
  expect(world.requests).toHaveLength(2);
  // The session keeps uses and ready answers by key, never a packet or a goal.
  const kept = readFileSync(
    join(profilePaths(home, 'default').decisions, `${other.id}.json`),
    'utf8',
  );
  expect(kept).not.toContain('tide table');
  expect(kept).not.toContain('Wrap the feed call');
});

test('routine calls write nothing in the vault; a kept decision writes exactly one receipt with its probabilities and provenance', async () => {
  const { world, mesa, vault, session } = await assistedSession();
  const before = folderSnapshot(vault);
  for (let i = 0; i < 3; i++) await mesa.decisions.evaluate(STEPS);
  expect(folderSnapshot(vault)).toEqual(before);

  const kept = await mesa.decisions.evaluate(STEPS, {
    rationale: 'The retry helper is the project convention',
  });
  expect(world.requests).toHaveLength(2);
  expect(kept.evaluation.status).toBe('accepted');
  expect(kept.receipt?.path).toMatch(/^receipts\//);
  const after = folderSnapshot(vault);
  const added = after.filter((f) => !before.some((b) => b.p === f.p) && f.text !== null);
  const changed = after.filter((f) => before.some((b) => b.p === f.p && b.text !== f.text));
  // The receipt, and its line in the log as every receipt has: nothing else changed.
  expect(added.map((f) => f.p)).toEqual([kept.receipt?.path]);
  expect(changed.map((f) => f.p)).toEqual(['log.md']);
  expect(changed[0]?.text).toContain('Faro answered 1 question (jev)');
  const receipt = readFileSync(join(vault, kept.receipt?.path ?? ''), 'utf8');
  expect(receipt).toContain('kind: decision');
  expect(receipt).toContain(`session: "${session.id}"`);
  expect(receipt).toContain('project: lantern-cove');
  expect(receipt).toContain('jev-1.13.0');
  expect(receipt).toContain('add-retry: 0.8');
  expect(receipt).toContain('The retry helper is the project convention');
});
