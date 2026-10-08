import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseWeight } from '../src/weights.js';

test('weights are whole grams, from kg or g', () => {
  assert.equal(parseWeight('1.25kg'), 1250);
  assert.equal(parseWeight('300g'), 300);
  assert.equal(parseWeight('2kg'), 2000);
  assert.equal(parseWeight('0.0004kg'), 0);
  assert.equal(parseWeight('12.6g'), 13);
});

test('any other unit throws an error whose code is E_UNIT', () => {
  for (const text of ['2lb', '5oz', '3']) {
    assert.throws(
      () => parseWeight(text),
      (error) => error.code === 'E_UNIT',
    );
  }
});
