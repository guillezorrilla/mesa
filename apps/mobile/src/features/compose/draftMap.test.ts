import { expect, test } from 'vitest';
import { appended, parseDrafts, withDraft } from './draftMap';

test('a draft is kept per session, and a blank one is dropped', () => {
  const drafts = withDraft({ a1: 'run the tests' }, 'b2', 'then the docs');
  expect(drafts).toEqual({ a1: 'run the tests', b2: 'then the docs' });
  expect(withDraft(drafts, 'a1', '  ')).toEqual({ b2: 'then the docs' });
});

test('an inserted prompt lands as its own paragraph under what was typed', () => {
  expect(appended('', 'run the tests')).toBe('run the tests');
  expect(appended('Before you push: \n', 'run the tests')).toBe(
    'Before you push:\n\nrun the tests',
  );
});

test('a broken drafts file reads as no drafts, and a value that is not text is dropped', () => {
  expect(parseDrafts('{"a1":"run the tests","b2":3}')).toEqual({ a1: 'run the tests' });
  expect(parseDrafts('[1]')).toEqual({});
  expect(parseDrafts('{')).toEqual({});
});
