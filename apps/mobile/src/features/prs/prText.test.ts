import { expect, test } from 'vitest';
import { checkSummary, prMeta, threadState } from './prText';

test('a PR is named by project, number and author', () => {
  expect(prMeta({ project: 'tide-pool', number: 7, author: 'lee-park' })).toBe(
    'tide-pool #7 · lee-park',
  );
});

test('checks count failing first, pending said as running', () => {
  expect(checkSummary([])).toBe('No checks');
  expect(
    checkSummary([
      { name: 'a', state: 'passing' },
      { name: 'b', state: 'pending' },
      { name: 'c', state: 'failing' },
      { name: 'd', state: 'passing' },
    ]),
  ).toBe('1 failing · 1 running · 2 passing');
});

test("a verdict wins over the provider's resolved flag", () => {
  expect(threadState({ resolved: true, verdict: 'not' })).toBe('Not addressed');
  expect(threadState({ resolved: true })).toBe('Resolved');
  expect(threadState({ resolved: false, verdict: 'mystery' })).toBe('Open');
});
