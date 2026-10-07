import { expect, test } from 'vitest';
import { QUALITY_GATES } from './evaluation/evaluation.js';
import { measuredText, siteMeasure } from './measured.js';
import {
  automaticGate,
  automaticSites,
  DECISION_SITES,
  PAIRED_PASSED,
  PASSED_GATE,
  provenSites,
} from './sites.js';
import { SYSTEM_ONE_PROVIDERS } from './systemone.js';

test('the measured numbers back the gate lists: a site passes a gate only on its numbers', () => {
  for (const model of SYSTEM_ONE_PROVIDERS) {
    for (const site of DECISION_SITES) {
      const { quality: q, paired } = siteMeasure(model, site);
      const gate = QUALITY_GATES[site];
      const meets =
        q.right / q.accepted >= gate.selectiveAccuracy && q.accepted / q.n >= gate.coverage;
      if (PASSED_GATE[model].includes(site)) expect(meets, `${model} ${site}`).toBe(true);
      expect(PAIRED_PASSED[model].includes(site), `${model} ${site}`).toBe(paired?.pass === true);
    }
  }
});

test('a site is automatic only where both gates passed, unless the person opted into experimental', () => {
  for (const model of SYSTEM_ONE_PROVIDERS) {
    const proven = provenSites(model);
    expect(proven.every((s) => PASSED_GATE[model].includes(s))).toBe(true);
    expect(proven.every((s) => PAIRED_PASSED[model].includes(s))).toBe(true);
    expect(automaticSites(model, false)).toEqual(proven);
    expect(automaticSites(model, true)).toEqual(PASSED_GATE[model]);
    expect(automaticGate(false)[model]).toEqual(proven);
  }
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
