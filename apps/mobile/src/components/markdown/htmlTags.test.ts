import { expect, test } from 'vitest';
import { attr } from './htmlTags';

test('attributes are read quoted or bare, with &amp; decoded', () => {
  expect(attr(' href="https://a.example/?x=1&amp;y=2" title=t', 'href')).toBe(
    'https://a.example/?x=1&y=2',
  );
  expect(attr(" alt='Score'", 'alt')).toBe('Score');
  expect(attr(' title=t', 'href')).toBe('');
});
