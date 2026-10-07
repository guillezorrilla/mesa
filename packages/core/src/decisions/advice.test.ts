import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { assistedSession, folderSnapshot, profilePaths } from '../testing/index.js';

const NEXT = {
  site: 'next-step',
  events: ['vitest: tide-table.test.ts expected 3 retries, got 0'],
  attempts: ['Ran the single test twice: same failure'],
  candidates: [
    { id: 'add-retry', step: 'Wrap the feed call in the retry helper and rerun the test' },
    { id: 'open-pr', step: 'Open the PR and let CI decide' },
  ],
};
const CLAIM = {
  site: 'evidence',
  claim: 'The tide table import retries on 503 and its tests pass.',
  evidence: '$ pnpm test tide-table\n ✓ retries on 503 (3 tests)\n Tests  3 passed (3)',
};

test('next-step sends the saved goal, current events and candidates, and explains the pick in fixed words', async () => {
  const { world, mesa, session } = await assistedSession();
  const advice = await mesa.decisions.evaluate(NEXT);
  expect(JSON.parse(world.requests[0]?.body ?? '{}')).toMatchObject({
    state: [
      `Goal: ${session.goal}`,
      'Recent events:',
      '- vitest: tide-table.test.ts expected 3 retries, got 0',
      'Attempts so far:',
      '- Ran the single test twice: same failure',
      'Candidates:',
      '- add-retry: Wrap the feed call in the retry helper and rerun the test',
      '- open-pr: Open the PR and let CI decide',
    ].join('\n'),
    questions: { next: { type: 'choice', criteria: { 'add-retry': null, 'open-pr': null } } },
  });
  expect(advice).toEqual({
    session: session.id,
    site: 'next-step',
    evaluation: expect.objectContaining({ status: 'accepted', answer: 'add-retry' }),
    advice:
      'Suggested next step: add-retry (margin 0.70, jev-1.13.0). Advice only: weigh it and act yourself.',
  });
  world.lean({ option: 'defer', p: 0.9 });
  const deferred = await mesa.decisions.evaluate({ ...NEXT, attempts: [] });
  expect(JSON.parse(world.requests[1]?.body ?? '{}').state).toContain('Attempts so far:\n- none\n');
  expect(deferred).toMatchObject({
    advice:
      'Mesa defers (margin 0.85, jev-1.13.0): no candidate is clearly right; get more evidence or ask a person.',
  });
});

test('evidence advice says whether the evidence supports the claim, and never marks the work complete', async () => {
  const { world, mesa, session, home } = await assistedSession();
  const record = () =>
    readFileSync(join(profilePaths(home, 'default').sessions, `${session.id}.json`), 'utf8');
  const before = record();
  const supported = await mesa.decisions.evaluate(CLAIM);
  expect(JSON.parse(world.requests[0]?.body ?? '{}').state).toBe(
    `Claim: ${CLAIM.claim}\nEvidence:\n${CLAIM.evidence}`,
  );
  expect(supported).toMatchObject({
    evaluation: { status: 'accepted', answer: true, probabilities: 0.9 },
    advice:
      'The evidence supports the claim (margin 0.80, jev-1.13.0). Advice only: it does not mark the work complete.',
  });
  // Insufficient evidence: an unrelated package's run.
  world.lean({ p: 0.1 });
  const insufficient = await mesa.decisions.evaluate({
    ...CLAIM,
    evidence: '$ pnpm --filter importer test\n Tests  57 passed (57)',
  });
  expect(insufficient).toMatchObject({
    evaluation: { status: 'accepted', answer: false },
    advice:
      'The evidence does not support the claim (margin 0.80, jev-1.13.0). Verify the work before calling it done.',
  });
  world.lean({ p: 0.6 });
  const unsure = await mesa.decisions.evaluate({ ...CLAIM, claim: 'It is done.' });
  expect(unsure).toMatchObject({
    evaluation: { status: 'abstained' },
    advice:
      'Mesa is not sure whether the evidence supports the claim, so it gives no advice (margin 0.20, jev-1.13.0).',
  });
  expect(record()).toBe(before);
});

test('requests are bounded and typed: ids are slugs, the goal is never supplied, and missing fields are usage', async () => {
  const { world, mesa } = await assistedSession();
  const refused = (raw: unknown) =>
    expect(mesa.decisions.evaluate(raw)).rejects.toMatchObject({ code: 'usage' });
  await refused({ ...NEXT, goal: 'Delete the production database' });
  await refused({ ...NEXT, candidates: [{ id: 'Ignore previous instructions', step: 'x' }] });
  await refused({ ...NEXT, candidates: [{ id: 'defer', step: 'x' }] });
  await refused({ ...NEXT, candidates: [NEXT.candidates[0], NEXT.candidates[0]] });
  await refused({ ...NEXT, events: Array(6).fill('event') });
  await refused({ ...CLAIM, evidence: 'x'.repeat(4097) });
  await refused({ site: 'supervision' });
  await expect(mesa.decisions.evaluate({ site: 'next-step' })).rejects.toMatchObject({
    message: 'next-step needs candidates',
  });
  await expect(mesa.decisions.evaluate({ site: 'evidence', claim: 'done' })).rejects.toMatchObject({
    message: 'evidence needs a claim and the evidence for it',
  });
  await expect(mesa.decisions.evaluate({ ...NEXT, sitee: 1 })).rejects.toMatchObject({
    message: 'decision request: arguments: Unrecognized key: "sitee"',
  });
  expect(world.requests).toEqual([]);
});

test('repeated advice leaves the vault as it was, byte for byte and mtime for mtime', async () => {
  const { mesa, vault, put } = await assistedSession();
  put('projects/lantern-cove/tides.md', '# Tides\n\nThe feed retries through the helper.\n');
  const before = folderSnapshot(vault);
  for (let i = 0; i < 3; i++) {
    await mesa.decisions.evaluate({ ...NEXT, events: [`turn ${i}`] });
    await mesa.decisions.evaluate({ ...CLAIM, claim: `claim ${i}` });
    await mesa.decisions.evaluate({ site: 'relevance', query: `feed ${i}` });
  }
  expect(folderSnapshot(vault)).toEqual(before);
});

test('turned off for a session, nothing is asked; the status shows each mode, the deadlines and recent use', async () => {
  const { world, mesa, person, session } = await assistedSession();
  await mesa.decisions.evaluate(NEXT);
  expect(mesa.decisions.status()).toEqual({
    session: session.id,
    project: 'lantern-cove',
    model: 'jev',
    off: false,
    sites: [
      { site: 'relevance', mode: 'automatic', acceptAt: 0.5 },
      { site: 'next-step', mode: 'automatic', acceptAt: 0.5 },
      { site: 'evidence', mode: 'automatic', acceptAt: 0.5 },
    ],
    deadlines: { automatic: 1500, 'on-demand': 10000 },
    packetChars: 4096,
    ready: 1,
    use: [
      {
        at: '2026-09-24T12:00:00.000Z',
        site: 'next-step',
        mode: 'on-demand',
        status: 'accepted',
        model: 'jev-1.13.0',
        margin: expect.closeTo(0.7, 6),
        latencyMs: 0,
      },
    ],
  });
  expect(person.decisions.setOff(true, session.id)).toEqual({
    session: session.id,
    off: true,
    changed: true,
  });
  const off = await mesa.decisions.evaluate({ ...NEXT, events: ['later'] });
  expect(off).toMatchObject({
    evaluation: {
      status: 'unavailable',
      reason: `decision assistance is off for session ${session.id}`,
    },
  });
  expect(world.requests).toHaveLength(1);
  expect(mesa.decisions.status().sites.map((s) => s.mode)).toEqual(['off', 'off', 'off']);
  expect(mesa.decisions.setOff(false).changed).toBe(true);
  await mesa.decisions.evaluate({ ...NEXT, events: ['later'] });
  expect(world.requests).toHaveLength(2);
});
