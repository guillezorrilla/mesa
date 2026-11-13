import { expect, test } from 'vitest';
import { syntaxSpans } from './syntaxSpans';

test('a code line is cut into keywords, strings, numbers and a trailing comment', () => {
  expect(syntaxSpans("export const ebb = 'low'; // 3 times")).toEqual([
    { text: 'export', kind: 'keyword' },
    { text: ' ' },
    { text: 'const', kind: 'keyword' },
    { text: ' ebb = ' },
    { text: "'low'", kind: 'string' },
    { text: '; ' },
    { text: '// 3 times', kind: 'comment' },
  ]);
  expect(syntaxSpans('tide2 = 42')).toEqual([{ text: 'tide2 = ' }, { text: '42', kind: 'number' }]);
  expect(syntaxSpans('')).toEqual([{ text: '' }]);
});
