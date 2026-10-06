import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { steppingClock, tempDir } from '../../testing/index.js';
import { DECISION_SITES, siteQuestion } from '../sites.js';
import { type EvalCase, readCorpus } from './corpus.js';
import { type EvalBackend, meetsGate, report, runCases } from './evaluation.js';

const STATES = ['working', 'waiting-permission', 'waiting-question', 'idle', 'done', 'failed'];
const permission = [
  'Agent: claude',
  'Screen tail:',
  ' Bash(pnpm test --filter lantern-cove)',
  ' Do you want to proceed?',
  ' > 1. Yes',
  '   2. No, and tell Claude what to do differently (esc)',
].join('\n');
const supervision = (id: string, state: string, expected: string): EvalCase => ({
  id,
  site: 'supervision',
  split: 'heldout',
  family: 'lantern-cove',
  tags: ['clear'],
  agent: 'claude',
  state,
  question: { kind: 'Choice', id: 'state', options: STATES },
  expected,
  rationale: 'invented',
});
const evidence = (id: string, expected: boolean): EvalCase => ({
  id,
  site: 'evidence',
  split: 'heldout',
  family: 'lantern-cove',
  tags: ['injection'],
  state: 'Claim: done\nEvidence:\n(none)',
  question: { kind: 'Noul', id: 'supported', statement: 'The evidence supports the claim' },
  expected,
  rationale: 'invented',
});

test('the rules baseline reads the screen for supervision and gives even answers elsewhere', async () => {
  const results = await runCases({ clock: steppingClock() }, [
    supervision('s1', permission, 'waiting-permission'),
    // Claude's reader calls any other non-empty screen idle, at the tail's 0.6.
    supervision('s2', 'Agent: claude\nScreen tail:\nnothing a reader knows', 'working'),
    evidence('e1', false),
  ]);
  expect(results).toMatchObject([
    { id: 's1', answer: 'waiting-permission', accepted: true, correct: true },
    { id: 's2', answer: 'idle', accepted: true, correct: false },
    { id: 'e1', p: 0.5, margin: 0, accepted: false },
  ]);
});

test('a backend that fails or answers off-question is unavailable, and the report counts each site', async () => {
  let call = 0;
  const backend: EvalBackend = {
    name: 'scripted',
    answer: async (_state, [q]) => {
      call++;
      if (call === 1) throw new Error('the Strands server answered HTTP 422');
      if (call === 2) return [{ id: 'other', kind: 'Noul', answer: true, probabilities: 0.9 }];
      return [{ id: q?.id, kind: 'Noul', answer: true, probabilities: call === 3 ? 0.95 : 0.6 }];
    },
  };
  const cases = [
    evidence('e1', true),
    evidence('e2', true),
    evidence('e3', false),
    evidence('e4', true),
  ];
  const results = await runCases(
    { backend, clock: steppingClock('2026-10-03T12:00:00.000Z', 10) },
    cases,
  );
  const out = report('scripted', 'heldout', results);
  expect(out.sites.evidence).toMatchObject({
    n: 4,
    answered: 2,
    unavailable: 2,
    // e3 at 0.95 leans 0.9 and is accepted but wrong; e4 at 0.6 leans 0.2 and abstains.
    accepted: 1,
    acceptedCorrect: 0,
    coverage: 0.25,
    selectiveAccuracy: 0,
    accuracy: 0.25,
    latencyMs: { p50: 10, p95: 10, total: 20 },
  });
  expect(out.misses.map((m) => m.id)).toEqual(['e1', 'e2', 'e3']);
  expect(out.sites.evidence?.byTag.injection?.n).toBe(4);
});

test('a site adds its wording under the descriptions a caller gave', () => {
  const asked = siteQuestion('relevance', {
    kind: 'Choice',
    id: 'source',
    options: ['note:a.md', 'none'],
    criteria: { 'note:a.md': 'Retry policy' },
  });
  expect(asked).toMatchObject({
    instructions: 'Which candidate source is most relevant to the query?',
    criteria: { 'note:a.md': 'Retry policy', none: 'No candidate is relevant to the query.' },
  });
});

test('a site meets its gate only above its accuracy and coverage, and beating the rules', () => {
  const at = (selectiveAccuracy: number, coverage: number, acceptedCorrect: number) =>
    ({ selectiveAccuracy, coverage, acceptedCorrect }) as Parameters<typeof meetsGate>[1];
  expect(meetsGate('evidence', at(0.9, 0.4, 12))).toBe(true);
  expect(meetsGate('evidence', at(0.89, 0.9, 27))).toBe(false);
  expect(meetsGate('evidence', at(1, 0.39, 11))).toBe(false);
  expect(meetsGate('supervision', at(0.95, 0.6, 17), at(1, 0.6, 18))).toBe(false);
});

test('a corpus line that breaks the schema is a usage error naming its line', () => {
  const dir = tempDir();
  const path = join(dir, 'bad.jsonl');
  const good = JSON.stringify(evidence('e1', true));
  writeFileSync(
    path,
    `${good}\n\n${JSON.stringify({ ...evidence('e2', true), expected: 'yes' })}\n`,
  );
  expect(() => readCorpus(path)).toThrow(/bad\.jsonl:3: expected must be a boolean/);
  writeFileSync(path, `${good}\n{"id": \n`);
  expect(() => readCorpus(path)).toThrow(/bad\.jsonl:2: not JSON/);
});

test('the shipped corpus parses, keeps its splits apart and has 25+ held-out cases per site', () => {
  const read = (split: string) =>
    readCorpus(new URL(`corpus/${split}.jsonl`, import.meta.url).pathname);
  const calibration = read('calibration');
  const heldout = read('heldout');
  expect(calibration.every((c) => c.split === 'calibration')).toBe(true);
  expect(heldout.every((c) => c.split === 'heldout')).toBe(true);
  const families = new Set(calibration.map((c) => c.family));
  expect(heldout.filter((c) => families.has(c.family))).toEqual([]);
  const ids = [...calibration, ...heldout].map((c) => c.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const site of DECISION_SITES) {
    expect(heldout.filter((c) => c.site === site).length).toBeGreaterThanOrEqual(25);
  }
});
