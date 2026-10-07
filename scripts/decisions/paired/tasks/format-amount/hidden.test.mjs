import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatAmount } from '../src/money.js';

test('amounts show KLP and two decimals', () => {
  assert.equal(formatAmount(1250), 'KLP 12.50');
  assert.equal(formatAmount(5), 'KLP 0.05');
  assert.equal(formatAmount(0), 'KLP 0.00');
  assert.equal(formatAmount(123456), 'KLP 1234.56');
});

test('a negative amount goes in parentheses, never with a minus sign', () => {
  assert.equal(formatAmount(-1250), 'KLP (12.50)');
  assert.equal(formatAmount(-7), 'KLP (0.07)');
});
