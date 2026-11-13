import { expect, test } from 'vitest';
import { detailsPieces } from './detailsPieces';

test('details markup is cut out of an HTML block, open only as an attribute', () => {
  expect(
    detailsPieces(
      '<details title="open logs">\n<summary><b>Logs</b></summary>\n<p>x</p>\n</details>',
    ),
  ).toEqual([
    { kind: 'open', open: false },
    { kind: 'summary', value: '<b>Logs</b>' },
    { kind: 'html', value: '\n<p>x</p>\n' },
    { kind: 'close' },
  ]);
  expect(detailsPieces('<details open><summary>S</summary>')).toEqual([
    { kind: 'open', open: true },
    { kind: 'summary', value: 'S' },
  ]);
});

test('an unclosed summary stays HTML and costs one pass', () => {
  const hostile = '<summary>'.repeat(20_000);
  const started = performance.now();
  expect(detailsPieces(hostile)).toEqual([{ kind: 'html', value: hostile }]);
  expect(performance.now() - started).toBeLessThan(500);
});
