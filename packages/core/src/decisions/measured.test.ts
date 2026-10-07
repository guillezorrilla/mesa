import { expect, test } from 'vitest';
import { meetsGate } from './evaluation/evaluation.js';
import { measuredText, PAIRED_PASSED, siteMeasure } from './measured.js';
import { DECISION_SITES, PASSED_GATE } from './sites.js';
import { SYSTEM_ONE_PROVIDERS } from './systemone.js';

test('the held-out numbers back the quality gate list: a site passes only on its numbers', () => {
  for (const model of SYSTEM_ONE_PROVIDERS) {
    for (const site of DECISION_SITES) {
      const { quality: q } = siteMeasure(model, site);
      const summary = {
        selectiveAccuracy: q.right / q.accepted,
        coverage: q.accepted / q.n,
        acceptedCorrect: q.right,
      };
      expect(PASSED_GATE[model].includes(site), `${model} ${site}`).toBe(meetsGate(site, summary));
    }
  }
});

test('the paired verdicts are read from the measured arms: relevance passes for both models', () => {
  expect(PAIRED_PASSED).toEqual({ jev: ['relevance'], clef: ['relevance'] });
  expect(siteMeasure('jev', 'relevance').paired).toEqual({
    on: { runs: 12, successes: 12, wallMs: 221389, msPerSuccess: 221389 / 12 },
    off: { runs: 12, successes: 0, wallMs: 291953, msPerSuccess: null },
    pass: true,
  });
  expect(siteMeasure('clef', 'next-step').paired).toBeUndefined();
});

test('each measure reads as one line, "not measured" before a paired run', () => {
  expect(measuredText(siteMeasure('clef', 'evidence'))).toBe(
    'Quality: 96% right where it answered, on 87% of 30 held-out cases. Paired workflows: not measured.',
  );
  const on = { runs: 12, successes: 10, wallMs: 190_800, msPerSuccess: 19_080 };
  const off = { runs: 12, successes: 0, wallMs: 127_200, msPerSuccess: null };
  expect(
    measuredText({ quality: { n: 30, accepted: 28, right: 28 }, paired: { on, off, pass: true } }),
  ).toBe(
    'Quality: 100% right where it answered, on 93% of 30 held-out cases. Paired workflows: 10 of 12 tasks solved against 0 of 12 without, 19 s against unbounded per solved task (passed).',
  );
});
