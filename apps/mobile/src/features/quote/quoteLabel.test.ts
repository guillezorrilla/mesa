import { expect, test } from 'vitest';
import { quoteLabel } from './quoteLabel';

test('a quote counts its lines', () => {
  expect([quoteLabel(1), quoteLabel(3)]).toEqual(['Quoting 1 line', 'Quoting 3 lines']);
});
