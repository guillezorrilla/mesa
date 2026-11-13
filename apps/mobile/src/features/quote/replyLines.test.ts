import { expect, test } from 'vitest';
import { passageOf, replyLines, tapReplyLine } from './replyLines';

const lines = replyLines([
  { code: false, text: 'Raised the ebb.\nShall I push?' },
  { code: true, text: 'export const ebb = 3;\nexport const flood = 4;' },
]);

test("a reply's lines keep their segment, and a passage joins the selected ones", () => {
  expect(lines.map((line) => [line.segment, line.code])).toEqual([
    [0, false],
    [0, false],
    [1, true],
    [1, true],
  ]);
  expect(passageOf(lines, { start: 2, end: 3 })).toBe(
    'export const ebb = 3;\nexport const flood = 4;',
  );
});

test('a selection stays inside one segment: a tap in another starts over there', () => {
  expect(tapReplyLine(lines, { start: 0, end: 0 }, 1)).toEqual({ start: 0, end: 1 });
  expect(tapReplyLine(lines, { start: 0, end: 0 }, 3)).toEqual({ start: 3, end: 3 });
});
