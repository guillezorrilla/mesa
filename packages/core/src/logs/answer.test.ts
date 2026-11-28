import { expect, test } from 'vitest';
import { answerParts } from './answer.js';

test('an answer gives up its suggested query, and its text keeps the rest', () => {
  expect(answerParts('Lookups fail [aa11].\n\n```query\nseverity>=ERROR\n```')).toEqual({
    text: 'Lookups fail [aa11].',
    query: 'severity>=ERROR',
  });
  expect(answerParts('No query here.')).toEqual({ text: 'No query here.', query: null });
});
