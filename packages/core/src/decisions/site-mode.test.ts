import { expect, test } from 'vitest';
import { automaticGate, type SiteGates, siteMode } from './site-mode.js';
import { DECISION_SITES } from './sites.js';

// Settings, the session details, `mesa decisions status`, evaluate and the Board all read siteMode,
// so this table is the one place the rule is checked.

test('a site is automatic where both gates passed, experimental when only opted in, else off or on demand', () => {
  const gates: SiteGates = {
    passed: { jev: ['supervision', 'relevance', 'next-step'], clef: [] },
    paired: { jev: ['relevance', 'evidence'], clef: ['relevance'] },
  };
  const mode = (opted: boolean) =>
    Object.fromEntries(DECISION_SITES.map((site) => [site, siteMode('jev', site, opted, gates)]));
  expect(mode(false)).toEqual({
    supervision: { mode: 'off', experimental: false },
    relevance: { mode: 'automatic', experimental: false },
    'next-step': { mode: 'on-demand', experimental: false },
    // Paired without the quality gate is never automatic.
    evidence: { mode: 'on-demand', experimental: true },
  });
  expect(mode(true)).toEqual({
    supervision: { mode: 'automatic', experimental: true },
    relevance: { mode: 'automatic', experimental: false },
    'next-step': { mode: 'automatic', experimental: true },
    evidence: { mode: 'on-demand', experimental: true },
  });
  expect(siteMode('clef', 'supervision', true, gates)).toEqual({
    mode: 'off',
    experimental: false,
  });
  expect(siteMode('clef', 'relevance', true, gates)).toEqual({
    mode: 'on-demand',
    experimental: true,
  });
  for (const site of DECISION_SITES)
    expect(siteMode('none', site, true)).toEqual({ mode: 'off', experimental: false });
});

test('with the measured gates, relevance is automatic for both models and supervision for CLEF; the rest need the opt-in', () => {
  expect(automaticGate(false)).toEqual({ jev: ['relevance'], clef: ['supervision', 'relevance'] });
  expect(automaticGate(true)).toEqual({ jev: DECISION_SITES, clef: DECISION_SITES });
  expect(siteMode('jev', 'supervision', false)).toEqual({ mode: 'off', experimental: false });
  expect(siteMode('clef', 'supervision', false)).toEqual({
    mode: 'automatic',
    experimental: false,
  });
  expect(siteMode('clef', 'evidence', false)).toEqual({ mode: 'on-demand', experimental: false });
});
