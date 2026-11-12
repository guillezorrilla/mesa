import { expect, test } from 'vitest';
import { adviceHeadline, percent } from './adviceText';

const odds = [
  { option: 'metres', p: 0.2 },
  { option: 'feet', p: 0.7 },
];

test('advice reads as its pick and how sure, or why there is none', () => {
  expect(percent(0.704)).toBe('70%');
  expect(adviceHeadline({ status: 'accepted', pick: 'feet', odds })).toBe(
    'The Decision model advises feet (70%)',
  );
  expect(adviceHeadline({ status: 'abstained', pick: 'feet', odds })).toBe(
    'The Decision model leans to feet (70%), not sure enough to advise',
  );
  expect(adviceHeadline({ status: 'accepted', odds, defer: 0.6 })).toBe(
    'The Decision model leaves this to you',
  );
  expect(adviceHeadline({ status: 'unavailable', odds: [], reason: 'no decision model' })).toBe(
    'No advice: no decision model',
  );
});
