import { expect, test } from 'vitest';
import { parsePlanUsage } from './plan-usage.js';

// Invented numbers in the shape claude 2.1.325's `/usage` prints in Structured mode.
const REPLY = [
  'You are paying for the harbour with a lantern plan',
  '',
  'Current session: 14% used · resets Nov 16 at 2:10pm (Harbour/Time)',
  'Current week (all models): 3.5% used · resets Nov 22 at 6pm (Harbour/Time)',
  'Current week (Tide): 0% used',
  '',
  "What's contributing to your usage?",
  'Approximate · sessions on this machine only',
  '',
  'Last 24h · 594 requests · 24 sessions',
  '  93%  Start fresh when you switch tasks · run /clear',
  '  Top skills: /lantern 2%, /buoy 1%',
  '',
  'Last 7d · 2187 requests · 40 sessions',
  '  61%  Run fewer sessions at once · up to 11 at once',
].join('\n');

test('reads the limits as bars with their resets, and the contributors by window', () => {
  expect(parsePlanUsage(REPLY)).toEqual({
    notes: ['You are paying for the harbour with a lantern plan'],
    limits: [
      { label: 'Current session', percent: 14, resets: 'Nov 16 at 2:10pm (Harbour/Time)' },
      {
        label: 'Current week (all models)',
        percent: 3.5,
        resets: 'Nov 22 at 6pm (Harbour/Time)',
      },
      { label: 'Current week (Tide)', percent: 0 },
    ],
    contributors: {
      notes: ["What's contributing to your usage?", 'Approximate · sessions on this machine only'],
      windows: [
        {
          title: 'Last 24h · 594 requests · 24 sessions',
          lines: [
            { percent: 93, text: 'Start fresh when you switch tasks · run /clear' },
            { text: 'Top skills: /lantern 2%, /buoy 1%' },
          ],
        },
        {
          title: 'Last 7d · 2187 requests · 40 sessions',
          lines: [{ percent: 61, text: 'Run fewer sessions at once · up to 11 at once' }],
        },
      ],
    },
  });
});

test('limits alone, with no contributors, still read', () => {
  expect(parsePlanUsage('Current session: 4% used')?.limits).toEqual([
    { label: 'Current session', percent: 4 },
  ]);
});

test('no report for text that names no limit', () => {
  expect(parsePlanUsage('Usage is not available for API key accounts.')).toBeUndefined();
  expect(parsePlanUsage('')).toBeUndefined();
});
